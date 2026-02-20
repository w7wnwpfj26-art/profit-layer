/**
 * DEX 现货兑换
 * 使用 1inch Aggregation API 获取最优路径
 * 构建的交易由 OKX 插件钱包签名执行
 */

const ONEINCH_BASE = "https://api.1inch.dev/swap/v6.0";

// ---- 常用代币地址（Arbitrum） ----
export const TOKENS_ARB: Record<string, { address: string; decimals: number; symbol: string }> = {
  USDC:  { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6,  symbol: "USDC" },
  USDT:  { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6,  symbol: "USDT" },
  ETH:   { address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", decimals: 18, symbol: "ETH"  },
  WETH:  { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18, symbol: "WETH" },
  WBTC:  { address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", decimals: 8,  symbol: "WBTC" },
  ARB:   { address: "0x912CE59144191C1204E64559FE8253a0B49E6548", decimals: 18, symbol: "ARB"  },
  LINK:  { address: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4", decimals: 18, symbol: "LINK" },
  GMX:   { address: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", decimals: 18, symbol: "GMX"  },
  DAI:   { address: "0xDA10009cbd5D07dd0CeCc66161FC93d7c9000da1", decimals: 18, symbol: "DAI"  },
};

// Ethereum 主网
export const TOKENS_ETH: Record<string, { address: string; decimals: number; symbol: string }> = {
  USDC:  { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6,  symbol: "USDC" },
  USDT:  { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6,  symbol: "USDT" },
  ETH:   { address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", decimals: 18, symbol: "ETH"  },
  WETH:  { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18, symbol: "WETH" },
  WBTC:  { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8,  symbol: "WBTC" },
  stETH: { address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", decimals: 18, symbol: "stETH"},
  LINK:  { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18, symbol: "LINK" },
};

const CHAIN_TOKENS: Record<number, typeof TOKENS_ARB> = {
  42161: TOKENS_ARB,
  1:     TOKENS_ETH,
};

// ---- 类型 ----
export interface SwapQuote {
  fromToken:    string;
  toToken:      string;
  fromAmount:   string;
  toAmount:     string;
  toAmountMin:  string;   // 扣滑点后最少收到
  estimatedGas: string;
  priceImpact:  number;   // %
  protocols:    string[]; // 经过的 DEX 名称
  slippage:     number;
}

export interface SwapTx {
  from:     string;
  to:       string;
  data:     string;
  value:    string;
  gas:      string;
  gasPrice: string;
  chainId:  number;
}

// ---- 获取兑换报价 ----
export async function getSwapQuote(params: {
  chainId:     number;
  fromToken:   string; // symbol 或 address
  toToken:     string;
  amount:      string; // 人类可读（如 "100"）
  slippage?:   number; // % 默认 0.5
}): Promise<SwapQuote | null> {
  const { chainId, fromToken, toToken, slippage = 0.5 } = params;
  const tokens = CHAIN_TOKENS[chainId] || TOKENS_ARB;

  const fromInfo = tokens[fromToken] || Object.values(tokens).find(t => t.address.toLowerCase() === fromToken.toLowerCase());
  const toInfo   = tokens[toToken]   || Object.values(tokens).find(t => t.address.toLowerCase() === toToken.toLowerCase());
  if (!fromInfo || !toInfo) return null;

  const amountWei = BigInt(Math.floor(parseFloat(params.amount) * 10 ** fromInfo.decimals)).toString();

  try {
    // 1inch 免费 API（rate limited，生产需要 API Key）
    const url = `${ONEINCH_BASE}/${chainId}/quote?` + new URLSearchParams({
      src:    fromInfo.address,
      dst:    toInfo.address,
      amount: amountWei,
    });

    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${process.env.ONEINCH_API_KEY || ""}`,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      // 降级：用固定价格估算
      return buildFallbackQuote(fromInfo, toInfo, params.amount, slippage);
    }

    const data = await res.json() as any;

    const toAmount = data.dstAmount || data.toAmount || "0";
    const toAmountNum = Number(BigInt(toAmount)) / 10 ** toInfo.decimals;
    const toAmountMin = (toAmountNum * (1 - slippage / 100)).toFixed(toInfo.decimals);

    const protocols = (data.protocols || [])
      .flat(3)
      .map((p: any) => p.name || "")
      .filter(Boolean)
      .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
      .slice(0, 4);

    return {
      fromToken:   fromInfo.symbol,
      toToken:     toInfo.symbol,
      fromAmount:  params.amount,
      toAmount:    toAmountNum.toFixed(6),
      toAmountMin,
      estimatedGas: data.estimatedGas || "300000",
      priceImpact: parseFloat(data.priceImpact || "0.1"),
      protocols:   protocols.length ? protocols : ["Uniswap V3"],
      slippage,
    };
  } catch (e) {
    console.warn("[DEX Swap] Quote failed, using fallback:", e);
    return buildFallbackQuote(fromInfo, toInfo, params.amount, slippage);
  }
}

function buildFallbackQuote(
  from: { symbol: string },
  to: { symbol: string; decimals: number },
  amount: string,
  slippage: number
): SwapQuote {
  // 静态汇率表（仅供演示）
  const RATES: Record<string, Record<string, number>> = {
    USDC: { ETH: 1 / 2700, WETH: 1 / 2700, WBTC: 1 / 98000, ARB: 1 / 0.35 },
    USDT: { ETH: 1 / 2700, WETH: 1 / 2700, WBTC: 1 / 98000, ARB: 1 / 0.35 },
    ETH:  { USDC: 2700, USDT: 2700 },
    WETH: { USDC: 2700, USDT: 2700 },
  };
  const rate = RATES[from.symbol]?.[to.symbol] || 1;
  const toAmt = parseFloat(amount) * rate;
  return {
    fromToken: from.symbol, toToken: to.symbol, fromAmount: amount,
    toAmount: toAmt.toFixed(6),
    toAmountMin: (toAmt * (1 - slippage / 100)).toFixed(6),
    estimatedGas: "350000", priceImpact: 0.1,
    protocols: ["Uniswap V3", "Camelot"],
    slippage,
  };
}

// ---- 构建兑换交易（用于 OKX 钱包签名）----
export async function buildSwapTx(params: {
  chainId:      number;
  fromToken:    string;
  toToken:      string;
  amount:       string;
  walletAddress: string;
  slippage?:    number;
}): Promise<SwapTx | null> {
  const { chainId, fromToken, toToken, walletAddress, slippage = 0.5 } = params;
  const tokens = CHAIN_TOKENS[chainId] || TOKENS_ARB;

  const fromInfo = tokens[fromToken] || { address: fromToken, decimals: 18, symbol: fromToken };
  const toInfo   = tokens[toToken]   || { address: toToken,   decimals: 18, symbol: toToken   };
  const amountWei = BigInt(Math.floor(parseFloat(params.amount) * 10 ** fromInfo.decimals)).toString();

  try {
    const url = `${ONEINCH_BASE}/${chainId}/swap?` + new URLSearchParams({
      src:        fromInfo.address,
      dst:        toInfo.address,
      amount:     amountWei,
      from:       walletAddress,
      slippage:   slippage.toString(),
      disableEstimate: "true",
    });

    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${process.env.ONEINCH_API_KEY || ""}`,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`1inch swap API error: ${res.status}`);
    const data = await res.json() as any;
    const tx = data.tx;

    return {
      from:     walletAddress,
      to:       tx.to,
      data:     tx.data,
      value:    tx.value || "0x0",
      gas:      tx.gas   || "350000",
      gasPrice: tx.gasPrice || "0",
      chainId,
    };
  } catch {
    // 构建一个 Uniswap V3 exactInputSingle 的 fallback tx
    return buildUniswapFallbackTx(fromInfo, toInfo, amountWei, walletAddress, slippage, chainId);
  }
}

// ---- Uniswap V3 fallback（Arbitrum） ----
function buildUniswapFallbackTx(
  from: { address: string; symbol: string },
  to: { address: string; symbol: string },
  amountWei: string,
  wallet: string,
  slippage: number,
  chainId: number
): SwapTx {
  const UNISWAP_ROUTER = chainId === 42161
    ? "0xE592427A0AEce92De3Edee1F18E0157C05861564" // Arb
    : "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // Eth

  // exactInputSingle selector + params（简化，实际需完整 ABI）
  const selector = "0x414bf389";
  const pad = (v: string) => v.replace("0x", "").padStart(64, "0");
  const deadline = (Math.floor(Date.now() / 1000) + 600).toString(16).padStart(64, "0");
  const fee = "0000000000000000000000000000000000000000000000000000000000000bb8"; // 3000 = 0.3%
  const sqrtPriceLimitX96 = "0".padStart(64, "0");
  const minOut = "0".padStart(64, "0"); // 简化，实际应计算

  const data = selector
    + pad(from.address)
    + pad(to.address)
    + fee
    + pad(wallet)
    + deadline
    + BigInt(amountWei).toString(16).padStart(64, "0")
    + minOut
    + sqrtPriceLimitX96;

  return {
    from: wallet, to: UNISWAP_ROUTER,
    data: "0x" + data,
    value: from.address.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      ? "0x" + BigInt(amountWei).toString(16)
      : "0x0",
    gas: "350000", gasPrice: "0",
    chainId,
  };
}
