/**
 * OpenClaw SDK 适配器
 * 
 * 提供真实的 DEX 聚合报价能力，支持：
 * - 多链并行报价 (EVM/Solana/Aptos)
 * - MEV 保护交易
 * - 智能路由优化
 * - 动态滑点控制
 */

import { Chain, createLogger } from "@profitlayer/common";

const logger = createLogger("openclaw-adapter");

// ---- Types ----

export interface OpenClawQuoteRequest {
  chain: Chain;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  senderAddress: string;
  slippageTolerance?: number;  // 默认 1%
  enableMevProtection?: boolean;
}

export interface OpenClawQuote {
  aggregator: "openclaw";
  chain: Chain;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  amountOutUsd: number;
  priceImpactPct: number;
  route: Array<{
    dex: string;
    poolAddress: string;
    tokenIn: string;
    tokenOut: string;
    portion: number;
  }>;
  gasEstimateUsd: number;
  totalCostUsd: number;
  netOutputUsd: number;
  mevProtected: boolean;
  txPayload: {
    chain: Chain;
    to: string;
    data: string;
    value: string;
  };
}

export interface OpenClawConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  enableMevProtection?: boolean;
}

// ---- Chain Mapping ----

const CHAIN_TO_OPENCLAW_ID: Partial<Record<Chain, string>> = {
  [Chain.ETHEREUM]: "ethereum",
  [Chain.ARBITRUM]: "arbitrum",
  [Chain.OPTIMISM]: "optimism",
  [Chain.BASE]: "base",
  [Chain.POLYGON]: "polygon",
  [Chain.BSC]: "bsc",
  [Chain.AVALANCHE]: "avalanche",
  [Chain.SOLANA]: "solana",
  [Chain.APTOS]: "aptos",
};

// ---- OpenClaw Adapter ----

export class OpenClawAdapter {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private enableMevProtection: boolean;

  constructor(config: OpenClawConfig = {}) {
    this.apiKey = config.apiKey || process.env.OPENCLAW_API_KEY || "";
    this.baseUrl = config.baseUrl || process.env.OPENCLAW_BASE_URL || "https://api.openclaw.ai/v1";
    this.timeout = config.timeout || 30000;
    this.enableMevProtection = config.enableMevProtection ?? (process.env.OPENCLAW_MEV_PROTECTION === "true");
  }

  /**
   * 获取 DEX 聚合报价
   */
  async getQuote(request: OpenClawQuoteRequest): Promise<OpenClawQuote> {
    const chainId = CHAIN_TO_OPENCLAW_ID[request.chain];
    if (!chainId) {
      throw new Error(`OpenClaw: 不支持的链 ${request.chain}`);
    }

    const enabled = process.env.OPENCLAW_ENABLED !== "false";
    if (!enabled) {
      logger.debug("OpenClaw: 已禁用，返回离线估算");
      return this.offlineEstimate(request);
    }

    try {
      const payload = {
        chain: chainId,
        fromToken: request.tokenIn,
        toToken: request.tokenOut,
        amount: request.amountIn,
        userAddress: request.senderAddress,
        slippage: request.slippageTolerance || 1,
        mevProtection: request.enableMevProtection ?? this.enableMevProtection,
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
      };
      if (this.apiKey) {
        headers["X-API-Key"] = this.apiKey;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/swap/quote`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        logger.warn(`OpenClaw API 错误: ${response.status} - ${errorText}`);
        return this.offlineEstimate(request);
      }

      const data = await response.json() as {
        outputAmount: string;
        outputAmountUsd: number;
        priceImpact: number;
        route: Array<{
          protocol: string;
          pool: string;
          tokenIn: string;
          tokenOut: string;
          share: number;
        }>;
        gasEstimate: number;
        gasEstimateUsd: number;
        mevProtected: boolean;
        tx: {
          to: string;
          data: string;
          value: string;
        };
      };

      return {
        aggregator: "openclaw",
        chain: request.chain,
        tokenIn: request.tokenIn,
        tokenOut: request.tokenOut,
        amountIn: request.amountIn,
        amountOut: data.outputAmount,
        amountOutUsd: data.outputAmountUsd,
        priceImpactPct: data.priceImpact,
        route: data.route.map(r => ({
          dex: r.protocol,
          poolAddress: r.pool,
          tokenIn: r.tokenIn,
          tokenOut: r.tokenOut,
          portion: r.share,
        })),
        gasEstimateUsd: data.gasEstimateUsd,
        totalCostUsd: data.gasEstimateUsd,
        netOutputUsd: data.outputAmountUsd - data.gasEstimateUsd,
        mevProtected: data.mevProtected,
        txPayload: {
          chain: request.chain,
          to: data.tx.to,
          data: data.tx.data,
          value: data.tx.value,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        logger.warn("OpenClaw: 请求超时");
      } else {
        logger.warn(`OpenClaw: 请求失败 - ${(error as Error).message}`);
      }
      return this.offlineEstimate(request);
    }
  }

  /**
   * 批量获取多链报价
   */
  async getMultiChainQuotes(
    requests: OpenClawQuoteRequest[]
  ): Promise<Map<Chain, OpenClawQuote>> {
    const results = new Map<Chain, OpenClawQuote>();
    
    // 并行获取所有链的报价
    const promises = requests.map(async (req) => {
      try {
        const quote = await this.getQuote(req);
        return { chain: req.chain, quote };
      } catch (error) {
        logger.warn(`OpenClaw: ${req.chain} 报价失败 - ${(error as Error).message}`);
        return { chain: req.chain, quote: this.offlineEstimate(req) };
      }
    });

    const responses = await Promise.all(promises);
    for (const { chain, quote } of responses) {
      results.set(chain, quote);
    }

    return results;
  }

  /**
   * 执行 MEV 保护交易
   */
  async executeMevProtectedSwap(quote: OpenClawQuote): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
  }> {
    if (!quote.mevProtected) {
      return { success: false, error: "报价未启用 MEV 保护" };
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
      };
      if (this.apiKey) {
        headers["X-API-Key"] = this.apiKey;
      }

      const response = await fetch(`${this.baseUrl}/swap/execute-protected`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          chain: CHAIN_TO_OPENCLAW_ID[quote.chain],
          txPayload: quote.txPayload,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        return { success: false, error: `API 错误: ${response.status} - ${errorText}` };
      }

      const data = await response.json() as { txHash: string };
      return { success: true, txHash: data.txHash };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 离线估算（当 API 不可用时的 fallback）
   */
  private offlineEstimate(request: OpenClawQuoteRequest): OpenClawQuote {
    // 基于链类型估算 Gas
    const gasEstimates: Partial<Record<Chain, number>> = {
      [Chain.ETHEREUM]: 0.08,
      [Chain.ARBITRUM]: 0.02,
      [Chain.OPTIMISM]: 0.015,
      [Chain.BASE]: 0.01,
      [Chain.POLYGON]: 0.005,
      [Chain.BSC]: 0.003,
      [Chain.SOLANA]: 0.001,
      [Chain.APTOS]: 0.002,
    };

    const gasUsd = gasEstimates[request.chain] || 0.05;

    return {
      aggregator: "openclaw",
      chain: request.chain,
      tokenIn: request.tokenIn,
      tokenOut: request.tokenOut,
      amountIn: request.amountIn,
      amountOut: "0", // 需要链下计算
      amountOutUsd: 0,
      priceImpactPct: 0,
      route: [{
        dex: "openclaw-estimate",
        poolAddress: "",
        tokenIn: request.tokenIn,
        tokenOut: request.tokenOut,
        portion: 100,
      }],
      gasEstimateUsd: gasUsd,
      totalCostUsd: gasUsd,
      netOutputUsd: 0,
      mevProtected: false,
      txPayload: {
        chain: request.chain,
        to: "0x0000000000000000000000000000000000000000",
        data: "0x",
        value: "0x0",
      },
    };
  }

  /**
   * 检查 API 健康状态
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        headers: this.apiKey ? { "X-API-Key": this.apiKey } : {},
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ---- Singleton Export ----

let _instance: OpenClawAdapter | null = null;

export function getOpenClawAdapter(config?: OpenClawConfig): OpenClawAdapter {
  if (!_instance) {
    _instance = new OpenClawAdapter(config);
  }
  return _instance;
}

export default OpenClawAdapter;
