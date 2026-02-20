/**
 * 跨链路由优化器 - LI.FI 集成
 *
 * 功能:
 * - 自动找最优跨链 bridge 路径
 * - 比较多个 bridge 的费用、速度、安全性
 * - 跨链套利路径发现
 * - Bridge 安全评分
 */

import { createLogger, Chain, type TransactionPayload } from "@defi-yield/common";
import { getHyperBridgeAdapter } from "../integrations/hyperbridge.js";

const logger = createLogger("executor:cross-chain");

// ---- Types ----

export interface CrossChainQuote {
  fromChain: Chain;
  toChain: Chain;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  bridgeName: string;
  estimatedGasUsd: number;
  bridgeFeeUsd: number;
  totalCostUsd: number;
  estimatedTimeSeconds: number;
  safetyScore: number; // 0-100
  steps: CrossChainStep[];
}

export interface CrossChainStep {
  type: "swap" | "bridge" | "approve";
  tool: string;
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  estimatedGasUsd: number;
}

export interface BridgeSafety {
  name: string;
  safetyScore: number;
  tvl: number;
  audited: boolean;
  incidents: number;
  avgTransferTime: number;
}

/** 跨链执行统一配置：滑点、deadline、单步超时、重试与回退 */
export interface CrossChainConfig {
  /** 滑点 bps，如 50 = 0.5%，默认 50 */
  slippageBps?: number;
  /** 路由 deadline（秒），用于 LI.FI 请求，默认 600 */
  deadlineSeconds?: number;
  /** 单步执行超时（毫秒），默认 120000 */
  stepTimeoutMs?: number;
  /** 单步失败时重试次数，默认 2 */
  maxRetriesPerStep?: number;
  /** 重试间隔（毫秒），默认 3000 */
  retryDelayMs?: number;
  /** 当前路由步骤失败后是否尝试下一条路由，默认 true */
  fallbackToNextRoute?: boolean;
}

const DEFAULT_CROSS_CHAIN_CONFIG: Required<CrossChainConfig> = {
  slippageBps: 50,
  deadlineSeconds: 600,
  stepTimeoutMs: 120_000,
  maxRetriesPerStep: 2,
  retryDelayMs: 3000,
  fallbackToNextRoute: true,
};

/** LI.FI API 原始路由结构（用于 parseLifiRoute 入参） */
interface LifiRouteRaw {
  fromChainId?: number | string;
  toChainId?: number | string;
  fromToken?: { symbol?: string };
  toToken?: { symbol?: string };
  fromAmount?: string;
  toAmount?: string;
  steps?: LifiStepRaw[];
  estimate?: { executionDuration?: string; feeCosts?: Array<{ amountUSD?: string }> };
}

interface LifiStepRaw {
  type?: string;
  tool?: string;
  action?: {
    fromChainId?: number | string;
    toChainId?: number | string;
    fromToken?: { symbol?: string };
    toToken?: { symbol?: string };
    fromAmount?: string;
  };
  estimate?: { toAmount?: string; gasCosts?: Array<{ amountUSD?: string }> };
}

// ---- Bridge Safety Database ----

const BRIDGE_SAFETY: Record<string, BridgeSafety> = {
  stargate: { name: "Stargate", safetyScore: 85, tvl: 500_000_000, audited: true, incidents: 0, avgTransferTime: 120 },
  across: { name: "Across", safetyScore: 88, tvl: 300_000_000, audited: true, incidents: 0, avgTransferTime: 60 },
  hop: { name: "Hop", safetyScore: 80, tvl: 150_000_000, audited: true, incidents: 0, avgTransferTime: 300 },
  cbridge: { name: "cBridge", safetyScore: 75, tvl: 200_000_000, audited: true, incidents: 1, avgTransferTime: 180 },
  synapse: { name: "Synapse", safetyScore: 72, tvl: 100_000_000, audited: true, incidents: 1, avgTransferTime: 300 },
  wormhole: { name: "Wormhole", safetyScore: 70, tvl: 800_000_000, audited: true, incidents: 1, avgTransferTime: 600 },
  layerzero: { name: "LayerZero", safetyScore: 82, tvl: 400_000_000, audited: true, incidents: 0, avgTransferTime: 120 },
  ccip: { name: "Chainlink CCIP", safetyScore: 92, tvl: 200_000_000, audited: true, incidents: 0, avgTransferTime: 300 },
};

// ---- Chain ID Mapping ----

const CHAIN_ID_MAP: Record<string, number> = {
  ethereum: 1,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
  polygon: 137,
  bsc: 56,
  avalanche: 43114,
};

const CHAIN_ID_TO_CHAIN: Record<number, Chain> = {
  1: Chain.ETHEREUM,
  42161: Chain.ARBITRUM,
  10: Chain.OPTIMISM,
  8453: Chain.BASE,
  137: Chain.POLYGON,
  56: Chain.BSC,
  43114: Chain.AVALANCHE,
};

/**
 * 跨链路由优化器
 *
 * 使用 LI.FI API 获取最优跨链路径,
 * 结合自有安全评分系统过滤不安全的 bridge
 */
export class CrossChainRouter {
  private lifiApiUrl = "https://li.quest/v1";
  private minSafetyScore: number;
  private defaultConfig: Required<CrossChainConfig>;
  private hyperBridgeAdapter = getHyperBridgeAdapter();

  constructor(minSafetyScore: number = 70, defaultConfig?: CrossChainConfig) {
    this.minSafetyScore = minSafetyScore;
    this.defaultConfig = { ...DEFAULT_CROSS_CHAIN_CONFIG, ...defaultConfig };
  }

  /**
   * 获取最优跨链路由
   * @param config 可选，覆盖默认跨链配置（滑点、deadline 等）
   */
  async getOptimalRoute(
    fromChain: Chain,
    toChain: Chain,
    fromToken: string,
    toToken: string,
    fromAmount: string,
    walletAddress: string,
    config?: CrossChainConfig,
  ): Promise<CrossChainQuote[]> {
    const fromChainId = CHAIN_ID_MAP[fromChain];
    const toChainId = CHAIN_ID_MAP[toChain];

    if (!fromChainId || !toChainId) {
      logger.warn(`Unsupported chain pair: ${fromChain} → ${toChain}`);
      return [];
    }

    const opts: Required<CrossChainConfig> = { ...this.defaultConfig, ...config };

    try {
      // 1. 获取 LI.FI 路由报价（带入滑点 / deadline）
      const quotes = await this.fetchLifiQuotes(
        fromChainId, toChainId, fromToken, toToken, fromAmount, walletAddress, opts,
      );

      // 2. 附加安全评分
      const scoredQuotes = quotes.map(q => ({
        ...q,
        safetyScore: this.getBridgeSafetyScore(q.bridgeName),
      }));

      // 3. 过滤不安全的 bridge
      const safeQuotes = scoredQuotes.filter(q => q.safetyScore >= this.minSafetyScore);

      // 4. 按综合评分排序 (成本 40% + 速度 30% + 安全 30%)
      safeQuotes.sort((a, b) => {
        const scoreA = this.calculateCompositeScore(a);
        const scoreB = this.calculateCompositeScore(b);
        return scoreB - scoreA;
      });

      logger.info(`Cross-chain route: ${fromChain}→${toChain}, ${quotes.length} routes, ${safeQuotes.length} safe`);
      
      // 使用真实的 HyperBridge SDK 获取跨链报价
      if (process.env.HYPERBRIDGE_ENABLED === "true") {
        try {
          const hyperQuote = await this.hyperBridgeAdapter.getQuote({
            sourceChain: fromChain,
            targetChain: toChain,
            fromToken,
            toToken,
            amount: fromAmount,
            recipient: walletAddress,
          });

          const supplement: CrossChainQuote = {
            fromChain,
            toChain,
            fromToken,
            toToken,
            fromAmount,
            toAmount: hyperQuote.estimatedOutput,
            bridgeName: "hyperbridge",
            estimatedGasUsd: hyperQuote.estimatedGasUsd,
            bridgeFeeUsd: hyperQuote.bridgeFeeUsd,
            totalCostUsd: hyperQuote.totalCostUsd,
            estimatedTimeSeconds: hyperQuote.estimatedTimeSeconds,
            safetyScore: hyperQuote.safetyScore,
            steps: [
              {
                type: "bridge",
                tool: "hyperbridge-htlc",
                fromChain: String(CHAIN_ID_MAP[fromChain]),
                toChain: String(CHAIN_ID_MAP[toChain]),
                fromToken,
                toToken,
                fromAmount,
                toAmount: hyperQuote.estimatedOutput,
                estimatedGasUsd: hyperQuote.estimatedGasUsd,
              },
            ],
          };
          // HyperBridge 安全分高，置顶作为首选
          safeQuotes.unshift(supplement);
          logger.info(`HyperBridge quote added: ${hyperQuote.estimatedOutput} output, $${hyperQuote.totalCostUsd} cost`);
        } catch (hyperErr) {
          logger.warn(`HyperBridge quote failed: ${(hyperErr as Error).message}`);
        }
      }
      return safeQuotes;
    } catch (err) {
      logger.error("Cross-chain routing failed", { error: (err as Error).message });
      return [];
    }
  }

  /**
   * 从 LI.FI API 获取路由报价
   */
  private async fetchLifiQuotes(
    fromChainId: number,
    toChainId: number,
    fromToken: string,
    toToken: string,
    fromAmount: string,
    walletAddress: string,
    config?: Required<CrossChainConfig>,
  ): Promise<CrossChainQuote[]> {
    const url = `${this.lifiApiUrl}/quote`;
    const params = new URLSearchParams({
      fromChain: String(fromChainId),
      toChain: String(toChainId),
      fromToken,
      toToken,
      fromAmount,
      fromAddress: walletAddress,
      order: "RECOMMENDED",
    });

    const resp = await fetch(`${url}?${params}`, {
      headers: { "Accept": "application/json" },
    });

    if (!resp.ok) {
      throw new Error(`LI.FI API error: ${resp.status}`);
    }

    const data = await resp.json();

    const slippage = config ? config.slippageBps / 10000 : 0.005;
    const deadline = config?.deadlineSeconds ?? 600;
    // LI.FI 返回单个最优路由, 用 /routes 获取多个
    const routesResp = await fetch(`${this.lifiApiUrl}/routes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromChainId,
        toChainId,
        fromTokenAddress: fromToken,
        toTokenAddress: toToken,
        fromAmount,
        fromAddress: walletAddress,
        options: {
          order: "RECOMMENDED",
          slippage,
          maxPriceImpact: 0.01,
          allowBridges: Object.keys(BRIDGE_SAFETY),
          deadline: Math.floor(Date.now() / 1000) + deadline,
        },
      }),
    });

    if (!routesResp.ok) {
      // Fallback to single quote
      return data ? [this.parseLifiRoute(data as LifiRouteRaw)] : [];
    }

    const routesData = await routesResp.json() as { routes?: LifiRouteRaw[] };
    const routes = routesData.routes || [];

    return routes.map((r) => this.parseLifiRoute(r));
  }

  /**
   * 解析 LI.FI 路由数据
   */
  private parseLifiRoute(route: LifiRouteRaw): CrossChainQuote {
    const stepType = (t: string | undefined): "swap" | "bridge" | "approve" => {
      if (t === "swap" || t === "bridge" || t === "approve") return t;
      return "bridge";
    };
    const steps: CrossChainStep[] = (route.steps || []).map((step: LifiStepRaw) => {
      const t = stepType(step.type);
      return {
        type: t,
        tool: step.tool || "",
        fromChain: step.action?.fromChainId?.toString() || "",
        toChain: step.action?.toChainId?.toString() || "",
        fromToken: step.action?.fromToken?.symbol || "",
        toToken: step.action?.toToken?.symbol || "",
        fromAmount: step.action?.fromAmount || "0",
        toAmount: step.estimate?.toAmount || "0",
        estimatedGasUsd: parseFloat(step.estimate?.gasCosts?.[0]?.amountUSD || "0"),
      };
    });

    const bridgeStep = steps.find(s => s.type === "bridge");
    const bridgeName = bridgeStep?.tool || route.steps?.[0]?.tool || "unknown";

    const gasCostUsd = steps.reduce((sum, s) => sum + s.estimatedGasUsd, 0);
    const bridgeFeeUsd = parseFloat(route.estimate?.feeCosts?.[0]?.amountUSD || "0");

    const fromChainId = route.fromChainId != null ? Number(route.fromChainId) : 0;
    const toChainId = route.toChainId != null ? Number(route.toChainId) : 0;

    return {
      fromChain: CHAIN_ID_TO_CHAIN[fromChainId] ?? Chain.ETHEREUM,
      toChain: CHAIN_ID_TO_CHAIN[toChainId] ?? Chain.ETHEREUM,
      fromToken: route.fromToken?.symbol || "",
      toToken: route.toToken?.symbol || "",
      fromAmount: route.fromAmount || "0",
      toAmount: route.toAmount || "0",
      bridgeName,
      estimatedGasUsd: gasCostUsd,
      bridgeFeeUsd,
      totalCostUsd: gasCostUsd + bridgeFeeUsd,
      estimatedTimeSeconds: parseInt(route.estimate?.executionDuration || "300"),
      safetyScore: 0, // Will be filled later
      steps,
    };
  }

  /**
   * 获取 bridge 安全评分
   */
  getBridgeSafetyScore(bridgeName: string): number {
    const key = bridgeName.toLowerCase().replace(/\s+/g, "");
    return BRIDGE_SAFETY[key]?.safetyScore || 50;
  }

  /**
   * 计算综合评分 (用于排序)
   */
  private calculateCompositeScore(quote: CrossChainQuote): number {
    // 成本评分 (越低越好, 归一化到 0-100)
    const costScore = Math.max(0, 100 - quote.totalCostUsd * 10);

    // 速度评分 (越快越好)
    const speedScore = Math.max(0, 100 - quote.estimatedTimeSeconds / 10);

    // 安全评分
    const safetyScore = quote.safetyScore;

    // 加权: 成本 40% + 速度 30% + 安全 30%
    return costScore * 0.4 + speedScore * 0.3 + safetyScore * 0.3;
  }

  /**
   * 获取所有 bridge 安全信息
   */
  getAllBridgeSafety(): BridgeSafety[] {
    return Object.values(BRIDGE_SAFETY).sort((a, b) => b.safetyScore - a.safetyScore);
  }

  /**
   * 为指定路由构建每步的链上交易 payload。
   * @param routeIndex 使用第几条路由（0=最优），用于失败时回退到下一条
   * @param config 滑点、deadline 等，与 getOptimalRoute 一致
   */
  async buildRouteTransactions(
    fromChain: Chain,
    toChain: Chain,
    fromToken: string,
    toToken: string,
    fromAmount: string,
    walletAddress: string,
    routeIndex: number = 0,
    config?: CrossChainConfig,
  ): Promise<TransactionPayload[]> {
    const fromChainId = CHAIN_ID_MAP[fromChain];
    const toChainId = CHAIN_ID_MAP[toChain];
    const opts = { ...this.defaultConfig, ...config };
    const slippage = opts.slippageBps / 10000;
    const deadline = Math.floor(Date.now() / 1000) + opts.deadlineSeconds;
    const routesResp = await fetch(`${this.lifiApiUrl}/routes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromChainId,
        toChainId,
        fromTokenAddress: fromToken,
        toTokenAddress: toToken,
        fromAmount,
        fromAddress: walletAddress,
        options: {
          order: "RECOMMENDED",
          slippage,
          maxPriceImpact: 0.01,
          allowBridges: Object.keys(BRIDGE_SAFETY),
          deadline,
        },
      }),
    });
    if (!routesResp.ok) return [];
    const routesData = await routesResp.json() as { routes?: LifiRouteRaw[] };
    const routes = routesData.routes || [];
    const route = routes[routeIndex];
    if (!route || !route.steps || route.steps.length === 0) return [];
    const payloads: TransactionPayload[] = [];
    for (const step of route.steps) {
      try {
        const resp = await fetch(`${this.lifiApiUrl}/stepTransaction`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step,
            fromAddress: walletAddress,
            slippage: opts.slippageBps / 10000,
            deadline,
          }),
        });
        if (!resp.ok) continue;
        const tx = await resp.json() as { transactionRequest?: { to?: string; data?: string; value?: string } };
        const req = tx.transactionRequest || {};
        if (!req.to || !req.data) continue;
        const chainId = Number(step.action?.fromChainId || route.fromChainId || fromChainId);
        const chain = CHAIN_ID_TO_CHAIN[chainId] || fromChain;
        payloads.push({
          chain,
          to: req.to,
          data: req.data,
          value: req.value || "0x0",
        });
      } catch {
        continue;
      }
    }
    return payloads;
  }

  /**
   * 检查跨链套利机会
   */
  async findCrossChainArbitrage(
    token: string,
    tokenAddresses: Record<string, string>,
    amountUsd: number,
    walletAddress: string,
  ): Promise<{ opportunity: boolean; profitUsd: number; route: string }> {
    const chains = Object.keys(tokenAddresses);
    let bestBuy = { chain: "", price: Infinity };
    let bestSell = { chain: "", price: 0 };

    // 获取各链价格 (通过 LI.FI quote)
    for (const chain of chains) {
      try {
        const chainId = CHAIN_ID_MAP[chain as Chain];
        if (!chainId) continue;

        // 简化: 用 USDC 报价
        const usdcAddress = this.getUsdcAddress(chain as Chain);
        if (!usdcAddress) continue;

        const quotes = await this.fetchLifiQuotes(
          chainId, chainId, usdcAddress, tokenAddresses[chain],
          String(BigInt(Math.floor(amountUsd * 1e6))), walletAddress
        );

        if (quotes.length > 0) {
          const outAmount = parseFloat(quotes[0].toAmount);
          const price = amountUsd / outAmount;
          if (price < bestBuy.price) bestBuy = { chain, price };
          if (price > bestSell.price) bestSell = { chain, price };
        }
      } catch {
        continue;
      }
    }

    if (bestBuy.chain && bestSell.chain && bestBuy.chain !== bestSell.chain) {
      const spread = (bestSell.price - bestBuy.price) / bestBuy.price;
      const grossProfit = amountUsd * spread;
      const bridgeCost = 5; // estimated
      const netProfit = grossProfit - bridgeCost;

      return {
        opportunity: netProfit > 10,
        profitUsd: Math.round(netProfit * 100) / 100,
        route: `Buy on ${bestBuy.chain} → Bridge → Sell on ${bestSell.chain} (spread ${(spread * 100).toFixed(2)}%)`,
      };
    }

    return { opportunity: false, profitUsd: 0, route: "" };
  }

  /**
   * 获取链上 USDC 地址
   */
  private getUsdcAddress(chain: Chain): string | null {
    const addresses: Record<string, string> = {
      ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      bsc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      avalanche: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    };
    return addresses[chain] || null;
  }
}
