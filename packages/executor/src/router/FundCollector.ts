// ============================================
// 资金自动归集器 (Fund Collector)
//
// 核心功能：
// 1. 扫描所有持仓的待领取奖励
// 2. 批量收割（Harvest）所有奖励
// 3. 将零散奖励代币兑换为目标代币（USDC/ETH）
// 4. 归集到统一账户，等待再投资
//
// 工作流程：
// 扫描奖励 → 批量收割 → 最优路径兑换 → 归集
// ============================================

import {
  Chain,
  ChainType,
  CHAIN_TYPE_MAP,
  TxType,
  createLogger,
  query,
  type TransactionPayload,
} from "@profitlayer/common";
import type { IProtocolAdapter } from "@profitlayer/adapters";
import { adapterRegistry } from "@profitlayer/adapters";
import type { TxExecutor } from "../transaction/TxExecutor.js";
import { DexAggregator, type SwapQuote } from "./DexAggregator.js";

const logger = createLogger("executor:fund-collector");

// ---- 类型 ----

export interface PendingReward {
  positionId: string;
  poolId: string;
  protocolId: string;
  chain: Chain;
  tokens: {
    address: string;
    symbol: string;
    amount: string;
    valueUsd: number;
  }[];
  totalValueUsd: number;
}

export interface CollectionResult {
  totalHarvested: number;          // 成功收割的仓位数
  totalSwapped: number;            // 成功兑换的代币种数
  totalCollectedUsd: number;       // 归集的总美元价值
  harvestTxHashes: string[];
  swapTxHashes: string[];
  errors: string[];
  gasSpentUsd: number;
}

export interface CollectionConfig {
  targetToken: string;             // 归集目标代币地址（如 USDC）
  targetTokenSymbol: string;       // "USDC"
  minHarvestValueUsd: number;      // 最低收割价值（低于此不值得花 Gas）
  minSwapValueUsd: number;         // 最低兑换价值
  maxSlippagePct: number;
  dryRun: boolean;                 // 模拟运行，不实际执行
}

// ---- 各链的 USDC 地址 ----

const USDC_ADDRESSES: Partial<Record<Chain, string>> = {
  [Chain.ETHEREUM]: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  [Chain.ARBITRUM]: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  [Chain.POLYGON]: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  [Chain.BSC]: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
  [Chain.BASE]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  [Chain.OPTIMISM]: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  [Chain.AVALANCHE]: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  [Chain.SOLANA]: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  [Chain.APTOS]: "0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC",
};

// ---- 资金归集器 ----

export class FundCollector {
  private dexAggregator: DexAggregator;

  constructor(
    private executor: TxExecutor,
    dexAggregator?: DexAggregator
  ) {
    this.dexAggregator = dexAggregator || new DexAggregator();
  }

  /**
   * 一键归集：扫描所有仓位奖励 → 收割 → 兑换 → 归集
   */
  async collectAll(
    walletAddress: string,
    chains: Chain[],
    config: Partial<CollectionConfig> = {}
  ): Promise<CollectionResult> {
    const cfg: CollectionConfig = {
      targetToken: "",
      targetTokenSymbol: "USDC",
      minHarvestValueUsd: 5,
      minSwapValueUsd: 10,
      maxSlippagePct: 1.0,
      dryRun: false,
      ...config,
    };

    const result: CollectionResult = {
      totalHarvested: 0,
      totalSwapped: 0,
      totalCollectedUsd: 0,
      harvestTxHashes: [],
      swapTxHashes: [],
      errors: [],
      gasSpentUsd: 0,
    };

    logger.info("开始资金归集", {
      wallet: walletAddress,
      chains,
      targetToken: cfg.targetTokenSymbol,
      dryRun: cfg.dryRun,
    });

    // 1. 扫描所有待领取奖励
    const pendingRewards = await this.scanPendingRewards(walletAddress, chains);
    logger.info(`发现 ${pendingRewards.length} 个仓位有待领取奖励`);

    if (pendingRewards.length === 0) {
      logger.info("没有可领取的奖励");
      return result;
    }

    // 2. 按价值筛选，过滤掉收割不划算的（Gas 大于奖励）
    const worthHarvesting = pendingRewards.filter(
      (r) => r.totalValueUsd >= cfg.minHarvestValueUsd
    );
    logger.info(
      `${worthHarvesting.length}/${pendingRewards.length} 个仓位值得收割` +
      `（最低 $${cfg.minHarvestValueUsd}）`
    );

    // 3. 批量收割
    for (const reward of worthHarvesting) {
      try {
        if (cfg.dryRun) {
          logger.info(`[模拟] 收割 ${reward.protocolId}/${reward.poolId}: $${reward.totalValueUsd}`);
          result.totalHarvested++;
          continue;
        }

        const adapter = adapterRegistry.get(reward.protocolId, reward.chain);
        if (!adapter) {
          result.errors.push(`找不到适配器: ${reward.protocolId}@${reward.chain}`);
          continue;
        }

        const harvestPayload = await adapter.harvest({ poolId: reward.poolId });
        const txRecord = await this.executor.execute(
          harvestPayload,
          TxType.HARVEST,
          reward.totalValueUsd,
          { poolId: reward.poolId, action: "auto_collect" }
        );

        result.harvestTxHashes.push(txRecord.txHash);
        result.totalHarvested++;
        result.gasSpentUsd += txRecord.gasCostUsd || 0;

        logger.info(`收割成功: ${reward.protocolId}/${reward.poolId}`, {
          txHash: txRecord.txHash,
          valueUsd: reward.totalValueUsd,
        });
      } catch (err) {
        result.errors.push(
          `收割失败 ${reward.protocolId}/${reward.poolId}: ${(err as Error).message}`
        );
      }
    }

    // 4. 将奖励代币兑换为目标代币
    const tokensToSwap = this.aggregateTokens(worthHarvesting);
    for (const token of tokensToSwap) {
      if (token.valueUsd < cfg.minSwapValueUsd) {
        logger.info(`跳过小额兑换: ${token.symbol} $${token.valueUsd.toFixed(2)}`);
        continue;
      }

      // 已经是目标代币则跳过
      if (token.symbol.toUpperCase() === cfg.targetTokenSymbol.toUpperCase()) {
        result.totalCollectedUsd += token.valueUsd;
        continue;
      }

      try {
        const targetAddr = cfg.targetToken ||
          USDC_ADDRESSES[token.chain] || "";

        if (!targetAddr) {
          result.errors.push(`${token.chain} 上没有 ${cfg.targetTokenSymbol} 地址`);
          continue;
        }

        if (cfg.dryRun) {
          logger.info(
            `[模拟] 兑换 ${token.symbol} → ${cfg.targetTokenSymbol}: $${token.valueUsd}`
          );
          result.totalSwapped++;
          result.totalCollectedUsd += token.valueUsd;
          continue;
        }

        // 获取最优兑换路径
        const quote = await this.dexAggregator.getBestQuote({
          chain: token.chain,
          tokenIn: token.address,
          tokenOut: targetAddr,
          amountIn: token.amount,
          slippagePct: cfg.maxSlippagePct,
          senderAddress: walletAddress,
        });

        if (!quote) {
          result.errors.push(`无法获取报价: ${token.symbol} → ${cfg.targetTokenSymbol}`);
          continue;
        }

        // 执行兑换
        const txRecord = await this.executor.execute(
          quote.txPayload,
          TxType.SWAP,
          token.valueUsd,
          {
            action: "auto_collect_swap",
            tokenIn: token.symbol,
            tokenOut: cfg.targetTokenSymbol,
            aggregator: quote.aggregator,
            route: quote.route.map((r) => r.dex).join(" → "),
          }
        );

        result.swapTxHashes.push(txRecord.txHash);
        result.totalSwapped++;
        result.totalCollectedUsd += token.valueUsd;
        result.gasSpentUsd += txRecord.gasCostUsd || 0;

        logger.info(`兑换成功: ${token.symbol} → ${cfg.targetTokenSymbol}`, {
          txHash: txRecord.txHash,
          aggregator: quote.aggregator,
          route: quote.route.map((r) => r.dex).join(" → "),
        });
      } catch (err) {
        result.errors.push(
          `兑换失败 ${token.symbol}: ${(err as Error).message}`
        );
      }
    }

    // 5. 记录归集日志
    try {
      await query(
        `INSERT INTO audit_log (event_type, severity, source, message, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          "fund_collection_complete",
          result.errors.length > 0 ? "warning" : "info",
          "fund_collector",
          `归集完成: 收割 ${result.totalHarvested} 笔, ` +
          `兑换 ${result.totalSwapped} 笔, ` +
          `总计 $${result.totalCollectedUsd.toFixed(2)}, ` +
          `Gas $${result.gasSpentUsd.toFixed(2)}`,
          JSON.stringify(result),
        ]
      );
    } catch {}

    logger.info("资金归集完成", {
      harvested: result.totalHarvested,
      swapped: result.totalSwapped,
      collectedUsd: result.totalCollectedUsd,
      gasUsd: result.gasSpentUsd,
      errors: result.errors.length,
    });

    return result;
  }

  /**
   * 扫描所有仓位的待领取奖励
   */
  private async scanPendingRewards(
    walletAddress: string,
    chains: Chain[]
  ): Promise<PendingReward[]> {
    const rewards: PendingReward[] = [];

    for (const chain of chains) {
      const adapters = adapterRegistry.getByChain(chain);

      for (const adapter of adapters) {
        try {
          const positions = await adapter.getAllPositions(walletAddress);

          for (const pos of positions) {
            const pending = await adapter.getPendingRewards(
              walletAddress, pos.poolId
            );

            if (pending.totalValueUsd > 0) {
              rewards.push({
                positionId: pos.positionId,
                poolId: pos.poolId,
                protocolId: adapter.protocolId,
                chain,
                tokens: pending.tokens,
                totalValueUsd: pending.totalValueUsd,
              });
            }
          }
        } catch (err) {
          logger.warn(`扫描奖励失败: ${adapter.protocolId}@${chain}`, {
            error: (err as Error).message,
          });
        }
      }
    }

    // 按价值从高到低排序
    rewards.sort((a, b) => b.totalValueUsd - a.totalValueUsd);
    return rewards;
  }

  /**
   * 聚合多个仓位的相同代币
   */
  private aggregateTokens(rewards: PendingReward[]): Array<{
    address: string;
    symbol: string;
    amount: string;
    valueUsd: number;
    chain: Chain;
  }> {
    const map = new Map<string, {
      address: string;
      symbol: string;
      amount: bigint;
      valueUsd: number;
      chain: Chain;
    }>();

    for (const reward of rewards) {
      for (const token of reward.tokens) {
        const key = `${reward.chain}:${token.address}`;
        const existing = map.get(key);
        if (existing) {
          existing.amount += BigInt(token.amount || "0");
          existing.valueUsd += token.valueUsd;
        } else {
          map.set(key, {
            address: token.address,
            symbol: token.symbol,
            amount: BigInt(token.amount || "0"),
            valueUsd: token.valueUsd,
            chain: reward.chain,
          });
        }
      }
    }

    return Array.from(map.values()).map((t) => ({
      ...t,
      amount: t.amount.toString(),
    }));
  }
}
