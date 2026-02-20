// ============================================
// Transaction Executor
// ============================================

import {
  Chain,
  ChainType,
  CHAIN_TYPE_MAP,
  TxStatus,
  MEV_SAFE_RPC,
  type TransactionPayload,
  type TransactionRecord,
  TxType,
  createLogger,
  query,
  loadConfig,
} from "@profitlayer/common";
import { createWalletClient, createPublicClient, http } from "viem";
import type { WalletManager } from "../wallet/WalletManager.js";
import { TxSimulator, type SimulationResult } from "./TxSimulator.js";
import { GasOptimizer } from "./GasOptimizer.js";
import { IntentRouter, type IntentOrder, type ExecutionResult as IntentResult } from "./IntentRouter.js";
import { CrossChainRouter, type CrossChainQuote, type CrossChainConfig } from "./CrossChainRouter.js";
import { DexAggregator, type QuoteRequest } from "../router/DexAggregator.js";
import { getContextFS } from "@profitlayer/common";
import path from "node:path";
import { approveTokensIfNeeded } from "./TokenApprover.js";
import crypto from "node:crypto";

const logger = createLogger("executor:tx");

// 从 CoinGecko 获取代币价格
async function fetchTokenPrice(tokenSymbol: string): Promise<number> {
  const COINGECKO_IDS: Record<string, string> = {
    ETH: "ethereum",
    WETH: "ethereum",
    BNB: "binancecoin",
    ARB: "arbitrum",
    MATIC: "polygon-ecosystem-token",
    POL: "polygon-ecosystem-token",
    AVAX: "avalanche-2",
    SOL: "solana",
  };
  
  const cgId = COINGECKO_IDS[tokenSymbol.toUpperCase()];
  if (!cgId) return 0;
  
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data = (await res.json()) as Record<string, { usd?: number }>;
    return data[cgId]?.usd ?? 0;
  } catch {
    return 0;
  }
}

// 各链原生代币符号
const CHAIN_NATIVE_TOKEN: Record<string, string> = {
  ethereum: "ETH",
  arbitrum: "ETH",
  optimism: "ETH",
  base: "ETH",
  bsc: "BNB",
  polygon: "MATIC",
  avalanche: "AVAX",
};

/**
 * Core transaction executor with safety checks.
 * All DeFi operations flow through this executor.
 *
 * 2026 升级:
 * - Intent-Based 路由 (CoW Protocol, UniswapX, MEV Blocker)
 * - 跨链路由优化 (LI.FI 集成)
 * - 智能 MEV 防护选择
 */
export class TxExecutor {
  private simulator: TxSimulator;
  private gasOptimizer: GasOptimizer;
  private intentRouter: IntentRouter;
  private crossChainRouter: CrossChainRouter;
  private dailySpentUsd = 0;
  private dailyResetTime = Date.now();
  private coldWalletMode: boolean;

  constructor(
    private walletManager: WalletManager,
    simulator?: TxSimulator,
    gasOptimizer?: GasOptimizer,
    coldWalletMode?: boolean
  ) {
    this.simulator = simulator || new TxSimulator();
    this.gasOptimizer = gasOptimizer || new GasOptimizer();
    this.intentRouter = new IntentRouter();
    this.crossChainRouter = new CrossChainRouter();
    // 默认启用冷钱包模式（不使用私钥直接签名）
    this.coldWalletMode = coldWalletMode ?? (process.env.COLD_WALLET_MODE !== 'false');
    if (this.coldWalletMode) {
      logger.info('❄️ 冷钱包模式已启用: 交易将加入签名队列，等待 OKX 钱包确认');
    }
    // 启动时从数据库加载日限额
    this.loadDailyLimits().catch(err => logger.warn('加载日限额失败', { error: err.message }));
  }

  /**
   * 从数据库加载日限额状态
   */
  private async loadDailyLimits(): Promise<void> {
    try {
      const spentResult = await query(
        `SELECT value FROM system_config WHERE key = 'daily_spent_usd'`
      );
      const resetResult = await query(
        `SELECT value FROM system_config WHERE key = 'daily_reset_time'`
      );
      
      if (spentResult.rows.length > 0) {
        this.dailySpentUsd = parseFloat(spentResult.rows[0].value) || 0;
      }
      if (resetResult.rows.length > 0) {
        this.dailyResetTime = parseInt(resetResult.rows[0].value) || Date.now();
      }
      
      logger.info('日限额已从数据库加载', {
        dailySpentUsd: this.dailySpentUsd,
        dailyResetTime: new Date(this.dailyResetTime).toISOString(),
      });
    } catch (err) {
      logger.warn('加载日限额失败，使用默认值', { error: (err as Error).message });
    }
  }

  /**
   * 保存日限额状态到数据库
   */
  private async saveDailyLimits(): Promise<void> {
    try {
      await query(
        `INSERT INTO system_config (key, value, description, category)
         VALUES ('daily_spent_usd', $1, '当日已支出 USD', 'risk')
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [this.dailySpentUsd.toString()]
      );
      await query(
        `INSERT INTO system_config (key, value, description, category)
         VALUES ('daily_reset_time', $1, '日限额重置时间戳', 'risk')
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [this.dailyResetTime.toString()]
      );
    } catch (err) {
      logger.warn('保存日限额失败', { error: (err as Error).message });
    }
  }

  /**
   * Intent-Based 交易执行 (新增)
   * 自动选择最优执行路径: CoW / UniswapX / MEV Blocker / Flashbots
   */
  async executeIntent(
    order: IntentOrder,
    txType: TxType,
    metadata?: Record<string, unknown>
  ): Promise<IntentResult> {
    const config = loadConfig();
    const walletAddress = this.walletManager.getAddress(order.chain) || "";

    // Safety checks
    if (config.risk.killSwitch) {
      throw new Error("KILL SWITCH ACTIVE - all transactions blocked");
    }

    const amountUsd = order.amountUsd || 0;
    if (amountUsd > config.risk.maxSingleTxUsd) {
      throw new Error(`Amount $${amountUsd} exceeds single tx limit $${config.risk.maxSingleTxUsd}`);
    }

    const method = this.intentRouter.selectMethod(order);
    logger.info(`Intent execution: ${order.chain} $${amountUsd} via ${method}`, {
      method,
      mevProtection: this.intentRouter.describeMethod(method),
    });

    const result = await this.intentRouter.execute(order, walletAddress);

    // Audit log
    await query(
      `INSERT INTO audit_log (event_type, severity, source, message, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        "intent_execution",
        result.status === "failed" ? "error" : "info",
        "executor:intent",
        `${method}: ${result.status} (MEV: ${result.mevProtection})`,
        JSON.stringify({ ...result, txType, ...metadata }),
      ]
    );

    return result;
  }

  /**
   * 跨链交易执行：LI.FI 最优路由 + 统一 slippage/deadline、单步重试、失败回退下一条路由
   */
  async executeCrossChain(
    fromChain: Chain,
    toChain: Chain,
    fromToken: string,
    toToken: string,
    fromAmount: string,
    metadata?: Record<string, unknown>,
    config?: CrossChainConfig,
  ): Promise<CrossChainQuote | null> {
    const walletAddress = this.walletManager.getAddress(fromChain) || "";
    const stepTimeoutMs = config?.stepTimeoutMs ?? 120_000;
    const maxRetries = config?.maxRetriesPerStep ?? 2;
    const retryDelayMs = config?.retryDelayMs ?? 3000;
    const fallbackToNextRoute = config?.fallbackToNextRoute !== false;

    logger.info(`Cross-chain: ${fromChain} → ${toChain}`, { fromToken, toToken, config: !!config });

    const routes = await this.crossChainRouter.getOptimalRoute(
      fromChain, toChain, fromToken, toToken, fromAmount, walletAddress, config,
    );

    if (routes.length === 0) {
      logger.warn("No safe cross-chain routes found");
      return null;
    }

    let lastError: Error | null = null;
    for (let routeIndex = 0; routeIndex < routes.length; routeIndex++) {
      const route = routes[routeIndex];
      logger.info(`Trying route ${routeIndex + 1}/${routes.length}: ${route.bridgeName} (safety=${route.safetyScore})`);

      const payloads = await this.crossChainRouter.buildRouteTransactions(
        fromChain, toChain, fromToken, toToken, fromAmount, walletAddress, routeIndex, config,
      );
      if (payloads.length === 0) {
        logger.warn(`Route ${route.bridgeName} produced no steps, skip`);
        continue;
      }

      let stepFailed = false;
      for (let i = 0; i < payloads.length; i++) {
        const payload = payloads[i];
        let attempt = 0;
        const runOne = () => {
          const timeoutPromise = new Promise<never>((_, rej) => {
            setTimeout(() => rej(new Error(`Step ${i + 1} timeout after ${stepTimeoutMs}ms`)), stepTimeoutMs);
          });
          return Promise.race([
            this.execute(payload, TxType.SWAP, route.totalCostUsd, {
              route: `${fromChain}→${toChain}`,
              bridge: route.bridgeName,
              stepIndex: i,
            }),
            timeoutPromise,
          ]);
        };

        while (attempt <= maxRetries) {
          try {
            await runOne();
            break;
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            attempt++;
            if (attempt <= maxRetries) {
              logger.warn(`Step ${i + 1} attempt ${attempt} failed, retry in ${retryDelayMs}ms`, {
                error: lastError.message,
              });
              await new Promise(r => setTimeout(r, retryDelayMs));
            } else {
              logger.error(`Step ${i + 1} failed after ${maxRetries + 1} attempts`, {
                error: lastError.message,
              });
              stepFailed = true;
              break;
            }
          }
        }
        if (stepFailed) break;
      }

      if (!stepFailed) {
        await query(
          `INSERT INTO audit_log (event_type, severity, source, message, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            "cross_chain_route",
            "info",
            "executor:cross-chain",
            `${fromChain}→${toChain} via ${route.bridgeName} (safety=${route.safetyScore})`,
            JSON.stringify({ ...route, ...metadata }),
          ],
        );
        return route;
      }

      if (!fallbackToNextRoute || routeIndex === routes.length - 1) {
        throw lastError ?? new Error("Cross-chain execution failed");
      }
      logger.info(`Falling back to next route (${routeIndex + 2}/${routes.length})`);
    }

    return null;
  }

  async executeAggregatedSwap(
    chain: Chain,
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    amountUsd: number,
    slippagePct?: number
  ): Promise<TransactionRecord> {
    const walletAddress = this.walletManager.getAddress(chain) || "";
    if (!walletAddress) throw new Error(`No wallet for chain ${chain}`);
    const aggregator = new DexAggregator(process.env.ONEINCH_API_KEY || "");
    const req: QuoteRequest = {
      chain,
      tokenIn,
      tokenOut,
      amountIn,
      slippagePct,
      senderAddress: walletAddress,
    };
    const res = await aggregator.getBestQuoteMultiSource(req);
    const preferred = res.allQuotes.find(q => q.txPayload && q.txPayload.to) || res.best;
    if (!preferred || !preferred.txPayload || !preferred.txPayload.to) throw new Error("No executable quote from aggregators");
    const payload = preferred.txPayload;
    await approveTokensIfNeeded(this, chain, [{ address: tokenIn, amount: amountIn }], payload.to as string);
    const record = await this.execute(payload, TxType.SWAP, amountUsd, {
      aggregator: preferred.aggregator,
      tokenIn,
      tokenOut,
    });
    return record;
  }

  /**
   * Execute a transaction with full safety pipeline:
   * 1. Kill switch check
   * 2. Spending limits check
   * 3. Transaction simulation
   * 4. Gas optimization
   * 5. Execution
   * 6. Confirmation
   * 7. Audit logging
   */
  async execute(
    payload: TransactionPayload,
    txType: TxType,
    amountUsd: number,
    metadata?: Record<string, unknown>
  ): Promise<TransactionRecord> {
    const config = loadConfig();
    const walletAddress = this.walletManager.getAddress(payload.chain) || "";

    logger.info("Executing transaction", {
      chain: payload.chain,
      txType,
      amountUsd,
      to: payload.to,
    });

    // ---- Safety Checks ----

    // 1. Kill switch
    if (config.risk.killSwitch) {
      const record = this.createRecord(payload, txType, walletAddress, amountUsd, metadata);
      record.status = TxStatus.REJECTED;
      await this.logTransaction(record);
      throw new Error("KILL SWITCH ACTIVE - all transactions blocked");
    }

    // 2. 磨损检查
    const minProfitableUsd = this.getMinProfitableAmount(payload.chain);
    if (amountUsd < minProfitableUsd && amountUsd > 0) {
      logger.warn("交易金额低于最低盈利线", {
        amountUsd,
        minProfitableUsd,
        chain: payload.chain,
      });
    }

    // 3. Per-transaction limit
    if (amountUsd > config.risk.maxSingleTxUsd) {
      const record = this.createRecord(payload, txType, walletAddress, amountUsd, metadata);
      record.status = TxStatus.REJECTED;
      await this.logTransaction(record);
      throw new Error(
        `Transaction amount $${amountUsd} exceeds limit $${config.risk.maxSingleTxUsd}`
      );
    }

    // 4. Daily limit
    this.resetDailyIfNeeded();
    if (this.dailySpentUsd + amountUsd > config.risk.maxDailyTxUsd) {
      const record = this.createRecord(payload, txType, walletAddress, amountUsd, metadata);
      record.status = TxStatus.REJECTED;
      await this.logTransaction(record);
      throw new Error(
        `Daily limit would be exceeded: spent=$${this.dailySpentUsd}, tx=$${amountUsd}, limit=$${config.risk.maxDailyTxUsd}`
      );
    }

    // ---- Simulation ----
    const simResult = await this.simulator.simulate(payload, walletAddress);
    if (!simResult.success) {
      const errMsg = simResult.error || simResult.revertReason || "unknown";
      const failureReason = errMsg.toLowerCase().includes("gas") ? "simulation_gas" : "simulation_revert";
      const record = this.createRecord(payload, txType, walletAddress, amountUsd, {
        ...(metadata ?? {}),
        error: errMsg,
        failureReason,
      });
      record.status = TxStatus.FAILED;
      await this.logTransaction(record);
      throw new Error(`Simulation failed: ${errMsg}`);
    }

    // ---- Execute ----
    const chainType = CHAIN_TYPE_MAP[payload.chain];
    let txHash: string;

    try {
      switch (chainType) {
        case ChainType.EVM:
          txHash = await this.executeEvm(payload, simResult, metadata?.aggregator as string | undefined);
          break;
        case ChainType.APTOS:
          txHash = await this.executeAptos(payload);
          break;
        case ChainType.SOLANA:
          txHash = await this.executeSolana(payload);
          break;
        default:
          throw new Error(`Unsupported chain type: ${chainType}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const lower = errMsg.toLowerCase();
      const failureReason =
        lower.includes("gas") || lower.includes("insufficient funds") ? "execution_gas"
        : lower.includes("revert") || lower.includes("execution reverted") ? "execution_revert"
        : lower.includes("slippage") || lower.includes("slippageexceeded") ? "execution_slippage"
        : lower.includes("timeout") || lower.includes("deadline") ? "execution_timeout"
        : "execution";
      const record = this.createRecord(payload, txType, walletAddress, amountUsd, {
        ...(metadata ?? {}),
        error: errMsg,
        failureReason,
      });
      record.status = TxStatus.FAILED;
      await this.logTransaction(record);
      throw err;
    }

    // ---- Record ----
    this.dailySpentUsd += amountUsd;
    // 持久化日限额到数据库
    this.saveDailyLimits().catch(() => {});

    const record = this.createRecord(payload, txType, walletAddress, amountUsd, metadata);
    record.txHash = txHash;
    record.status = TxStatus.SUBMITTED;
    
    // 计算 Gas 费用：使用真实代币价格
    const gasUnits = Number(simResult.gasEstimate || 200000n);
    const estimatedGasPriceGwei = 30; // 默认 30 gwei，可从链上获取
    const nativeToken = CHAIN_NATIVE_TOKEN[payload.chain] || "ETH";
    const nativeTokenPrice = await fetchTokenPrice(nativeToken); // 获取真实代币价格
    record.gasCostUsd = (gasUnits * estimatedGasPriceGwei / 1e9) * (nativeTokenPrice || 50); // 使用真实价格，fallback 50

    await this.logTransaction(record);

    logger.info("Transaction submitted", {
      txHash,
      chain: payload.chain,
      txType,
      amountUsd,
    });

    return record;
  }

  private async executeEvm(
    payload: TransactionPayload,
    simResult: SimulationResult,
    aggregator?: string
  ): Promise<string> {
    // 冷钱包模式：加入签名队列，返回交易 ID
    if (this.coldWalletMode) {
      return await this.addToSignatureQueue(payload, simResult);
    }

    // 热钱包模式：直接签名并发送
    const walletData = this.walletManager.getEvmClient(payload.chain);
    if (!walletData) throw new Error(`No EVM wallet for chain ${payload.chain}`);

    const { client, account } = walletData;

    // MEV 保护：主网交易通过 Flashbots 私有通道发送
    const mevRpc = MEV_SAFE_RPC[payload.chain as Chain];
    if (mevRpc) {
      logger.info(`MEV 保护启用: ${payload.chain} → ${mevRpc}`);
    }

    const gasEstimate = await this.gasOptimizer.getOptimalGas(
      payload.chain,
      simResult.gasEstimate || 200000n,
      2000,
      aggregator
    );

    // Use MEV-safe RPC transport if available, otherwise use default client
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txClient: any = mevRpc
      ? createWalletClient({ account, chain: client.chain!, transport: http(mevRpc) })
      : client;
    const hash = await txClient.sendTransaction({
      to: payload.to as `0x${string}`,
      data: (payload.data || "0x") as `0x${string}`,
      value: BigInt(payload.value || "0"),
      maxFeePerGas: gasEstimate.maxFeePerGas || undefined,
      maxPriorityFeePerGas: gasEstimate.maxPriorityFeePerGas || undefined,
      chain: client.chain,
      account: account,
    });

    return hash;
  }

  /**
   * 冷钱包模式：将交易加入 pending_signatures 队列
   * 前端 Dashboard 的 SignatureRequestModal 会显示弹窗让用户通过 OKX 钱包确认
   */
  private async addToSignatureQueue(
    payload: TransactionPayload,
    simResult: SimulationResult
  ): Promise<string> {
    const chainIdMap: Record<string, number> = {
      ethereum: 1,
      arbitrum: 42161,
      base: 8453,
      optimism: 10,
      polygon: 137,
      bsc: 56,
      avalanche: 43114,
    };
    const chainId = chainIdMap[payload.chain] || 1;
    const txId = crypto.randomUUID();

    const txPayload = {
      from: this.walletManager.getAddress(payload.chain) || "",
      to: payload.to,
      data: payload.data || "0x",
      value: `0x${BigInt(payload.value || "0").toString(16)}`,
      chainId: `0x${chainId.toString(16)}`,
    };

    await query(
      `INSERT INTO pending_signatures (id, chain_id, tx_type, amount_usd, payload, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW())`,
      [txId, chainId, 'transaction', 0, JSON.stringify(txPayload)]
    );

    logger.info(`❄️ 交易已加入签名队列`, {
      txId,
      chain: payload.chain,
      to: payload.to,
    });

    // 返回 txId 作为临时标识，实际 txHash 将在用户签名后更新
    return `pending:${txId}`;
  }

  private async executeAptos(payload: TransactionPayload): Promise<string> {
    const aptosClient = this.walletManager.getAptosClient();
    if (!aptosClient) throw new Error("No Aptos wallet loaded");

    const { client, account } = aptosClient;

    const txn = await client.transaction.build.simple({
      sender: account.accountAddress,
      data: payload.aptosPayload as any,
    });

    const pendingTxn = await client.signAndSubmitTransaction({
      signer: account,
      transaction: txn,
    });

    return pendingTxn.hash;
  }

  private async executeSolana(payload: TransactionPayload): Promise<string> {
    const solanaClient = this.walletManager.getSolanaClient();
    if (!solanaClient) throw new Error("No Solana wallet loaded");

    const { connection, keypair } = solanaClient;

    // 如果 payload.data 是序列化的交易（base64），直接发送
    if (payload.data) {
      const { Transaction } = await import("@solana/web3.js");
      const txBuf = Buffer.from(payload.data, "base64");
      const tx = Transaction.from(txBuf);
      tx.sign(keypair);
      const sig = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(sig, "confirmed");
      return sig;
    }

    // 如果是手动构建的交易
    const solanaIxs = payload.solanaInstruction as Array<{
      programId: string;
      keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
      data: string;
    }> | undefined;
    
    if (solanaIxs && solanaIxs.length > 0) {
      const { Transaction, TransactionInstruction, PublicKey } = await import("@solana/web3.js");
      const tx = new Transaction();

      for (const ix of solanaIxs) {
        tx.add(
          new TransactionInstruction({
            programId: new PublicKey(ix.programId),
            keys: ix.keys.map((k: any) => ({
              pubkey: new PublicKey(k.pubkey),
              isSigner: k.isSigner,
              isWritable: k.isWritable,
            })),
            data: Buffer.from(ix.data, "base64"),
          })
        );
      }

      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx.feePayer = keypair.publicKey;
      tx.sign(keypair);

      const sig = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(sig, "confirmed");
      return sig;
    }

    throw new Error("Solana transaction requires either serialized data or instructions");
  }

  private createRecord(
    payload: TransactionPayload,
    txType: TxType,
    walletAddress: string,
    amountUsd: number,
    metadata?: Record<string, unknown>
  ): TransactionRecord {
    return {
      txHash: "",
      chain: payload.chain,
      walletAddress,
      txType,
      amountUsd,
      gasCostUsd: 0,
      status: TxStatus.PENDING,
      metadata,
      createdAt: new Date(),
    };
  }

  private async logTransaction(record: TransactionRecord): Promise<void> {
    try {
      await query(
        `INSERT INTO transactions (tx_hash, chain_id, wallet_address, tx_type, amount_usd, gas_cost_usd, status, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          record.txHash || "none",
          record.chain,
          record.walletAddress,
          record.txType,
          record.amountUsd,
          record.gasCostUsd,
          record.status,
          JSON.stringify(record.metadata || {}),
        ]
      );
    } catch (err) {
      logger.error("Failed to log transaction", { error: (err as Error).message });
    }
    try {
      const fsctx = getContextFS();
      const dir = `transactions/${record.chain}/${record.txType}`;
      const name = `${record.txHash || `${Date.now()}`}.json`;
      await fsctx.addResource(path.join(dir, name), {
        txHash: record.txHash || "none",
        chain: record.chain,
        walletAddress: record.walletAddress,
        txType: record.txType,
        amountUsd: record.amountUsd,
        gasCostUsd: record.gasCostUsd,
        status: record.status,
        metadata: record.metadata || {},
        createdAt: record.createdAt?.toISOString?.() || new Date().toISOString(),
      });
    } catch {}
  }

  private getMinProfitableAmount(chain: Chain): number {
    const minimums: Record<string, number> = {
      ethereum: 500,
      arbitrum: 10,
      polygon: 5,
      base: 10,
      optimism: 10,
      bsc: 10,
      avalanche: 15,
      aptos: 2,
      solana: 2,
    };
    return minimums[chain] || 50;
  }

  private resetDailyIfNeeded(): void {
    const now = Date.now();
    const elapsed = now - this.dailyResetTime;
    if (elapsed > 24 * 60 * 60 * 1000) {
      this.dailySpentUsd = 0;
      this.dailyResetTime = now;
      // 持久化重置后的状态
      this.saveDailyLimits().catch(() => {});
    }
  }
}
