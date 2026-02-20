// ============================================
// DEX 聚合路由器 (DEX Aggregator Router)
//
// 自动找到全网最优兑换路径：
// - EVM 链: 1inch API（聚合 Uniswap/Sushi/Curve/Balancer 等数百个 DEX）
// - Solana: Jupiter API（聚合 Raydium/Orca/Lifinity 等）
// - Aptos: Thala Router / Hippo API
//
// 核心功能：
// 1. 比较所有 DEX 的报价，选最优路径
// 2. 自动拆单（大额交易分散到多个 DEX 减少滑点）
// 3. 返回可直接签名的交易数据
// ============================================

import {
  Chain,
  ChainType,
  CHAIN_TYPE_MAP,
  createLogger,
  type TransactionPayload,
} from "@defi-yield/common";
import { encodeFunctionData } from "viem";
import { getOpenClawAdapter } from "../integrations/openclaw.js";
import { getSlippageForAggregator } from "../config/aggregatorFeeConfig.js";

const logger = createLogger("executor:dex-aggregator");

// ---- 类型 ----

export interface SwapQuote {
  aggregator: string;          // "1inch" / "jupiter" / "thala"
  chain: Chain;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;           // 预期获得数量
  amountOutUsd: number;
  priceImpactPct: number;
  route: SwapRouteStep[];      // 路由路径
  gasEstimateUsd: number;
  totalCostUsd: number;        // 滑点 + gas + 手续费
  netOutputUsd: number;        // 实际到手价值
  txPayload: TransactionPayload;
}

export interface SwapRouteStep {
  dex: string;                 // "uniswap-v3" / "curve" / "sushiswap"
  poolAddress: string;
  tokenIn: string;
  tokenOut: string;
  portion: number;             // 这条路占总量的百分比 (0-100)
}

export interface QuoteRequest {
  chain: Chain;
  tokenIn: string;             // Token 合约地址
  tokenOut: string;
  amountIn: string;            // 原始精度数量
  slippagePct?: number;        // 最大允许滑点（默认 0.5%）
  senderAddress: string;       // 发送方地址
}

// ---- 1inch API 配置 ----

const ONEINCH_CHAIN_IDS: Partial<Record<Chain, number>> = {
  [Chain.ETHEREUM]: 1,
  [Chain.ARBITRUM]: 42161,
  [Chain.BSC]: 56,
  [Chain.POLYGON]: 137,
  [Chain.BASE]: 8453,
  [Chain.OPTIMISM]: 10,
  [Chain.AVALANCHE]: 43114,
};

const JUPITER_API = "https://quote-api.jup.ag/v6";
const ONEINCH_API = "https://api.1inch.dev/swap/v6.0";

// ---- DEX 聚合器 ----

export class DexAggregator {
  private oneInchApiKey: string;
  private openClawAdapter = getOpenClawAdapter();

  constructor(oneInchApiKey?: string) {
    this.oneInchApiKey = oneInchApiKey || process.env.ONEINCH_API_KEY || "";
  }

  /**
   * 获取最优兑换报价。
   * 自动根据链类型选择聚合器。
   */
  async getBestQuote(request: QuoteRequest): Promise<SwapQuote | null> {
    const chainType = CHAIN_TYPE_MAP[request.chain];

    try {
      switch (chainType) {
        case ChainType.EVM:
          return await this.getEvmQuote(request);
        case ChainType.SOLANA:
          return await this.getSolanaQuote(request);
        case ChainType.APTOS:
          return await this.getAptosQuote(request);
        default:
          logger.warn(`不支持的链类型: ${chainType}`);
          return null;
      }
    } catch (err) {
      logger.error(`获取报价失败`, {
        chain: request.chain,
        error: (err as Error).message,
      });
      return null;
    }
  }

  /**
   * 获取多个聚合器的报价并比较，返回最优。
   */
  async getBestQuoteMultiSource(request: QuoteRequest): Promise<{
    best: SwapQuote | null;
    allQuotes: SwapQuote[];
    savings: number;  // 最优 vs 最差的价差（美元）
  }> {
    const quotes: SwapQuote[] = [];

    // 获取所有可用的报价
    const chainType = CHAIN_TYPE_MAP[request.chain];

    if (chainType === ChainType.EVM) {
      const baseSlippage = request.slippagePct ?? 0.5;
      const oneInch = await this.getEvmQuote({ ...request, slippagePct: getSlippageForAggregator("1inch", baseSlippage) }).catch(() => null);
      if (oneInch) quotes.push(oneInch);
      const openClaw = await this.getOpenClawQuote({ ...request, slippagePct: getSlippageForAggregator("openclaw", baseSlippage) }).catch(() => null);
      if (openClaw) quotes.push(openClaw);
      const zeroEx = await this.getZeroExQuote({ ...request, slippagePct: getSlippageForAggregator("0x", baseSlippage) }).catch(() => null);
      if (zeroEx) quotes.push(zeroEx);
      const paraswap = await this.getParaswapQuote({ ...request, slippagePct: getSlippageForAggregator("paraswap", baseSlippage) }).catch(() => null);
      if (paraswap) quotes.push(paraswap);
    } else if (chainType === ChainType.SOLANA) {
      const baseSlippage = request.slippagePct ?? 0.5;
      const jupiter = await this.getSolanaQuote({ ...request, slippagePct: getSlippageForAggregator("jupiter", baseSlippage) }).catch(() => null);
      if (jupiter) quotes.push(jupiter);
      const openClaw = await this.getOpenClawQuote({ ...request, slippagePct: getSlippageForAggregator("openclaw", baseSlippage) }).catch(() => null);
      if (openClaw) quotes.push(openClaw);
    } else if (chainType === ChainType.APTOS) {
      const baseSlippage = request.slippagePct ?? 0.5;
      const thala = await this.getAptosQuote(request).catch(() => null);
      if (thala) quotes.push(thala);
      const openClaw = await this.getOpenClawQuote({ ...request, slippagePct: getSlippageForAggregator("openclaw", baseSlippage) }).catch(() => null);
      if (openClaw) quotes.push(openClaw);
    }

    if (quotes.length === 0) {
      return { best: null, allQuotes: [], savings: 0 };
    }

    // 按净输出排序，取最优
    quotes.sort((a, b) => b.netOutputUsd - a.netOutputUsd);
    const best = quotes[0];
    const worst = quotes[quotes.length - 1];
    const savings = best.netOutputUsd - worst.netOutputUsd;

    logger.info(`最优报价: ${best.aggregator}`, {
      chain: request.chain,
      amountOutUsd: best.amountOutUsd,
      gasEstimateUsd: best.gasEstimateUsd,
      netOutputUsd: best.netOutputUsd,
      quotesCompared: quotes.length,
      savings,
    });

    return { best, allQuotes: quotes, savings };
  }

  // ---- EVM: 1inch API ----

  private async getEvmQuote(request: QuoteRequest): Promise<SwapQuote> {
    const chainId = ONEINCH_CHAIN_IDS[request.chain];
    if (!chainId) throw new Error(`1inch 不支持 ${request.chain}`);

    const slippage = request.slippagePct || 0.5;

    // 1inch Swap API
    const url = `${ONEINCH_API}/${chainId}/swap?` + new URLSearchParams({
      src: request.tokenIn,
      dst: request.tokenOut,
      amount: request.amountIn,
      from: request.senderAddress,
      slippage: slippage.toString(),
      disableEstimate: "true",
      allowPartialFill: "false",
    });

    const headers: Record<string, string> = {
      "Accept": "application/json",
    };
    if (this.oneInchApiKey) {
      headers["Authorization"] = `Bearer ${this.oneInchApiKey}`;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) {
      // 如果 API 不可用，用离线估算
      logger.warn(`1inch API 返回 ${res.status}，使用离线估算`);
      const uni = this.buildUniswapV3ExactInputSingle(request);
      if (uni) return uni;
      return this.offlineEstimate(request, "1inch");
    }

    const data = await res.json() as {
      dstAmount: string;
      tx: { to: string; data: string; value: string; gas: number };
      protocols: Array<Array<Array<{ name: string; part: number; fromTokenAddress: string; toTokenAddress: string }>>>;
    };

    // 解析路由
    const route: SwapRouteStep[] = [];
    if (data.protocols?.[0]) {
      for (const step of data.protocols[0]) {
        for (const hop of step) {
          route.push({
            dex: hop.name,
            poolAddress: "",
            tokenIn: hop.fromTokenAddress,
            tokenOut: hop.toTokenAddress,
            portion: hop.part,
          });
        }
      }
    }

    const gasUsd = (data.tx.gas || 200000) * 0.00000003 * 2000; // 粗估

    return {
      aggregator: "1inch",
      chain: request.chain,
      tokenIn: request.tokenIn,
      tokenOut: request.tokenOut,
      amountIn: request.amountIn,
      amountOut: data.dstAmount,
      amountOutUsd: 0, // 需要价格换算
      priceImpactPct: 0,
      route,
      gasEstimateUsd: gasUsd,
      totalCostUsd: gasUsd,
      netOutputUsd: 0,
      txPayload: {
        chain: request.chain,
        to: data.tx.to,
        data: data.tx.data,
        value: data.tx.value,
      },
    };
  }

  private buildUniswapV3ExactInputSingle(request: QuoteRequest): SwapQuote | null {
    const UNI_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
    try {
      const deadline = Math.floor(Date.now() / 1000) + 600;
      const paramsAbi = [{
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      }];
      const abi = [{
        type: "function",
        name: "exactInputSingle",
        stateMutability: "payable",
        inputs: paramsAbi,
        outputs: [{ name: "amountOut", type: "uint256" }],
      }] as const;
      const data = encodeFunctionData({
        abi,
        functionName: "exactInputSingle",
        args: [{
          tokenIn: request.tokenIn,
          tokenOut: request.tokenOut,
          fee: 3000,
          recipient: request.senderAddress,
          deadline,
          amountIn: BigInt(request.amountIn),
          amountOutMinimum: 0n,
          sqrtPriceLimitX96: 0n,
        }],
      });
      return {
        aggregator: "uniswap-v3",
        chain: request.chain,
        tokenIn: request.tokenIn,
        tokenOut: request.tokenOut,
        amountIn: request.amountIn,
        amountOut: "0",
        amountOutUsd: 0,
        priceImpactPct: 0,
        route: [{ dex: "uniswap-v3", poolAddress: "", tokenIn: request.tokenIn, tokenOut: request.tokenOut, portion: 100 }],
        gasEstimateUsd: 0.03,
        totalCostUsd: 0.03,
        netOutputUsd: 0,
        txPayload: { chain: request.chain, to: UNI_ROUTER, data, value: "0x0" },
      };
    } catch {
      return null;
    }
  }

  private async getOpenClawQuote(request: QuoteRequest): Promise<SwapQuote> {
    try {
      // 使用真实的 OpenClaw SDK 适配器获取报价
      const quote = await this.openClawAdapter.getQuote({
        chain: request.chain,
        tokenIn: request.tokenIn,
        tokenOut: request.tokenOut,
        amountIn: request.amountIn,
        senderAddress: request.senderAddress,
        slippageTolerance: request.slippagePct || 1,
        enableMevProtection: process.env.OPENCLAW_MEV_PROTECTION === "true",
      });

      // 转换为标准 SwapQuote 格式
      return {
        aggregator: "openclaw",
        chain: request.chain,
        tokenIn: request.tokenIn,
        tokenOut: request.tokenOut,
        amountIn: request.amountIn,
        amountOut: quote.amountOut,
        amountOutUsd: quote.amountOutUsd,
        priceImpactPct: quote.priceImpactPct,
        route: quote.route,
        gasEstimateUsd: quote.gasEstimateUsd,
        totalCostUsd: quote.totalCostUsd,
        netOutputUsd: quote.netOutputUsd,
        txPayload: quote.txPayload,
      };
    } catch (error) {
      logger.warn(`OpenClaw quote failed: ${(error as Error).message}`);
      return this.offlineEstimate(request, "openclaw");
    }
  }

  private async getZeroExQuote(request: QuoteRequest): Promise<SwapQuote> {
    const ZEROX_CHAIN_IDS: Partial<Record<Chain, number>> = {
      [Chain.ETHEREUM]: 1,
      [Chain.ARBITRUM]: 42161,
      [Chain.BSC]: 56,
      [Chain.POLYGON]: 137,
      [Chain.BASE]: 8453,
      [Chain.OPTIMISM]: 10,
    };
    const chainId = ZEROX_CHAIN_IDS[request.chain];
    if (!chainId) throw new Error(`0x 不支持 ${request.chain}`);
    const params = new URLSearchParams({
      buyToken: request.tokenOut,
      sellToken: request.tokenIn,
      sellAmount: request.amountIn,
      takerAddress: request.senderAddress,
    });
    const headers: Record<string, string> = { "Accept": "application/json" };
    const apiKey = process.env.ZEROX_API_KEY || "";
    if (apiKey) headers["0x-api-key"] = apiKey;
    const res = await fetch(`https://api.0x.org/swap/v1/quote?${params}&chainId=${chainId}`, { headers });
    if (!res.ok) return this.offlineEstimate(request, "0x");
    const data = await res.json() as {
      buyAmount: string;
      to: string;
      data: string;
      value: string;
      gas: string | number;
    };
    const gas = typeof data.gas === "string" ? parseInt(data.gas) : (data.gas || 200000);
    const gasUsd = gas * 0.00000003 * 2000;
    return {
      aggregator: "0x",
      chain: request.chain,
      tokenIn: request.tokenIn,
      tokenOut: request.tokenOut,
      amountIn: request.amountIn,
      amountOut: data.buyAmount,
      amountOutUsd: 0,
      priceImpactPct: 0,
      route: [{ dex: "0x", poolAddress: "", tokenIn: request.tokenIn, tokenOut: request.tokenOut, portion: 100 }],
      gasEstimateUsd: gasUsd,
      totalCostUsd: gasUsd,
      netOutputUsd: 0,
      txPayload: { chain: request.chain, to: data.to, data: data.data, value: data.value },
    };
  }

  private async getParaswapQuote(request: QuoteRequest): Promise<SwapQuote> {
    const PARASWAP_CHAIN_IDS: Partial<Record<Chain, number>> = {
      [Chain.ETHEREUM]: 1,
      [Chain.ARBITRUM]: 42161,
      [Chain.BSC]: 56,
      [Chain.POLYGON]: 137,
      [Chain.BASE]: 8453,
      [Chain.OPTIMISM]: 10,
    };
    const chainId = PARASWAP_CHAIN_IDS[request.chain];
    if (!chainId) throw new Error(`Paraswap 不支持 ${request.chain}`);
    const baseParams = {
      srcToken: request.tokenIn,
      destToken: request.tokenOut,
      amount: request.amountIn,
      srcDecimals: "18",
      destDecimals: "18",
      side: "SELL",
      network: String(chainId),
    };
    const pricesUrl = `https://apiv5.paraswap.io/prices/?${new URLSearchParams(baseParams as any).toString()}`;
    const pricesRes = await fetch(pricesUrl, { headers: { "Accept": "application/json" } });
    if (!pricesRes.ok) return this.offlineEstimate(request, "paraswap");
    const pricesData = await pricesRes.json() as { priceRoute?: any };
    const priceRoute = pricesData.priceRoute || null;
    const destAmount = priceRoute?.destAmount || "0";
    let txPayload: TransactionPayload | undefined;
    try {
      const txRes = await fetch(`https://apiv5.paraswap.io/transactions/${chainId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          srcToken: request.tokenIn,
          destToken: request.tokenOut,
          srcDecimals: 18,
          destDecimals: 18,
          userAddress: request.senderAddress,
          priceRoute,
          slippage: (request.slippagePct || 0.5) / 100,
        }),
      });
      if (txRes.ok) {
        const txData = await txRes.json() as { to?: string; data?: string; value?: string; gasPrice?: string };
        if (txData.to && txData.data) {
          txPayload = {
            chain: request.chain,
            to: txData.to,
            data: txData.data,
            value: txData.value || "0x0",
          };
        }
      }
    } catch {}
    return {
      aggregator: "paraswap",
      chain: request.chain,
      tokenIn: request.tokenIn,
      tokenOut: request.tokenOut,
      amountIn: request.amountIn,
      amountOut: destAmount,
      amountOutUsd: 0,
      priceImpactPct: 0,
      route: [{ dex: "paraswap", poolAddress: "", tokenIn: request.tokenIn, tokenOut: request.tokenOut, portion: 100 }],
      gasEstimateUsd: 3,
      totalCostUsd: 3,
      netOutputUsd: 0,
      txPayload: txPayload || { chain: request.chain, to: "", data: "0x", value: "0x0" },
    };
  }

  // ---- Solana: Jupiter API ----

  private async getSolanaQuote(request: QuoteRequest): Promise<SwapQuote> {
    const slippageBps = Math.round((request.slippagePct || 0.5) * 100);

    // Jupiter Quote API
    const quoteUrl = `${JUPITER_API}/quote?` + new URLSearchParams({
      inputMint: request.tokenIn,
      outputMint: request.tokenOut,
      amount: request.amountIn,
      slippageBps: slippageBps.toString(),
    });

    const quoteRes = await fetch(quoteUrl);
    if (!quoteRes.ok) {
      logger.warn(`Jupiter API 返回 ${quoteRes.status}，使用离线估算`);
      return this.offlineEstimate(request, "jupiter");
    }

    const quoteData = await quoteRes.json() as {
      outAmount: string;
      priceImpactPct: string;
      routePlan: Array<{ swapInfo: { ammKey: string; label: string }; percent: number }>;
    };

    // 获取可执行的交易
    const swapRes = await fetch(`${JUPITER_API}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quoteData,
        userPublicKey: request.senderAddress,
        wrapAndUnwrapSol: true,
      }),
    });

    let txData = "0x";
    if (swapRes.ok) {
      const swap = await swapRes.json() as { swapTransaction: string };
      txData = swap.swapTransaction;
    }

    const route: SwapRouteStep[] = (quoteData.routePlan || []).map((r) => ({
      dex: r.swapInfo.label,
      poolAddress: r.swapInfo.ammKey,
      tokenIn: request.tokenIn,
      tokenOut: request.tokenOut,
      portion: r.percent,
    }));

    return {
      aggregator: "jupiter",
      chain: Chain.SOLANA,
      tokenIn: request.tokenIn,
      tokenOut: request.tokenOut,
      amountIn: request.amountIn,
      amountOut: quoteData.outAmount,
      amountOutUsd: 0,
      priceImpactPct: parseFloat(quoteData.priceImpactPct || "0"),
      route,
      gasEstimateUsd: 0.003,  // Solana 费用极低
      totalCostUsd: 0.003,
      netOutputUsd: 0,
      txPayload: {
        chain: Chain.SOLANA,
        to: "",
        solanaInstruction: txData,
      },
    };
  }

  // ---- Aptos: Thala Router / 直接路由 ----

  private async getAptosQuote(request: QuoteRequest): Promise<SwapQuote> {
    // Thala SDK 路由（简化版，实际用 @thalalabs/router-sdk）
    return this.offlineEstimate(request, "thala-router");
  }

  // ---- 离线估算（API 不可用时的后备方案）----

  private offlineEstimate(request: QuoteRequest, aggregator: string): SwapQuote {
    logger.info(`使用离线估算: ${aggregator} on ${request.chain}`);

    // 根据链估算 gas
    const gasEstimates: Record<string, number> = {
      ethereum: 15, arbitrum: 0.15, polygon: 0.02,
      base: 0.05, optimism: 0.05, bsc: 0.10,
      avalanche: 0.08, solana: 0.003, aptos: 0.005,
    };

    return {
      aggregator,
      chain: request.chain,
      tokenIn: request.tokenIn,
      tokenOut: request.tokenOut,
      amountIn: request.amountIn,
      amountOut: "0",  // 离线无法精确计算
      amountOutUsd: 0,
      priceImpactPct: 0,
      route: [{ dex: aggregator, poolAddress: "", tokenIn: request.tokenIn, tokenOut: request.tokenOut, portion: 100 }],
      gasEstimateUsd: gasEstimates[request.chain] || 1,
      totalCostUsd: gasEstimates[request.chain] || 1,
      netOutputUsd: 0,
      txPayload: {
        chain: request.chain,
        to: "",
        data: "0x",
      },
    };
  }
}
