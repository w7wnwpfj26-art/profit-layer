/**
 * GMX v2 数据层
 * - 读取资金费率、市场价格、持仓（无需钱包）
 * - 构建链上交易 payload（由 OKX 插件钱包签名执行）
 *
 * GMX v2 Arbitrum 合约地址
 */

// ---- 合约地址（Arbitrum） ----
export const GMX = {
  ExchangeRouter:  "0x7C68C7866A64FA2160F78EEaE12217FFbf871fa8",
  OrderVault:      "0x31eF83a530Fde1B38EE9A18093A333D8Bbbc40D5",
  Router:          "0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064",
  USDC:            "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  WETH:            "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  // Market tokens（GM tokens）
  BTC_USD_Market:  "0x47c031236e19d024b42f8AE6780E44A573170703",
  ETH_USD_Market:  "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336",
  SOL_USD_Market:  "0x09400D9DB990D5ed3f35D7be61DfAEB900Af03C9",
  ARB_USD_Market:  "0xC25cEf6061Cf5dE5eb761b50E4743c1F5D7E5407",
};

// ---- GMX Stats API（公开，无需认证）----
const GMX_STATS   = "https://arbitrum.gmx-oracle.io";
const GMX_API     = "https://gmx-server-mainnet.uw.r.appspot.com";
const GMX_SUBGRAPH = "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/synthetics-arbitrum-stats/api";

// ---- 类型 ----
export interface GMXMarket {
  marketToken:   string;
  indexToken:    string;
  longToken:     string;
  shortToken:    string;
  name:          string;
  symbol:        string;
  price:         number;
  fundingRateHourly: number;  // 每小时资金费率（小数）
  fundingRateAnnualized: number; // 年化 %
  openInterestLong:  number;  // USD
  openInterestShort: number;  // USD
  utilization:   number;      // OI 利用率 %
  volume24h:     number;      // 24h 交易量 USD
}

export interface GMXPosition {
  account:       string;
  market:        string;
  collateralToken: string;
  isLong:        boolean;
  sizeInUsd:     number;
  collateralAmount: number;
  entryPrice:    number;
  currentPrice:  number;
  unrealizedPnl: number;
  leverage:      number;
  liqPrice:      number;
}

// ---- 获取 GMX v2 市场数据（含资金费率）----
export async function getGMXMarkets(): Promise<GMXMarket[]> {
  try {
    // 使用 GMX 的公开统计 API
    const res = await fetch(`${GMX_STATS}/prices/tickers`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error("GMX stats API error");
    const tickers = await res.json() as any[];

    // 同时获取资金费率数据
    const frRes = await fetch(`${GMX_STATS}/funding_rates`, {
      signal: AbortSignal.timeout(6000),
    }).catch(() => null);
    const frData: Record<string, any> = frRes?.ok ? await frRes.json() : {};

    const MARKETS: Record<string, string> = {
      "BTC":  GMX.BTC_USD_Market,
      "ETH":  GMX.ETH_USD_Market,
      "SOL":  GMX.SOL_USD_Market,
      "ARB":  GMX.ARB_USD_Market,
    };

    return tickers
      .filter((t: any) => Object.keys(MARKETS).some(s => t.tokenSymbol?.startsWith(s)))
      .map((t: any): GMXMarket => {
        const sym = Object.keys(MARKETS).find(s => t.tokenSymbol?.startsWith(s)) || "";
        const price = parseFloat(t.minPrice || t.price || "0") / 1e30;
        const fr = frData[t.tokenSymbol] || {};
        const fundingHourly = parseFloat(fr.fundingFeeRateHourly || "0");
        const oiLong  = parseFloat(t.openInterestLong  || "0") / 1e30;
        const oiShort = parseFloat(t.openInterestShort || "0") / 1e30;

        return {
          marketToken:   MARKETS[sym] || "",
          indexToken:    t.tokenAddress || "",
          longToken:     GMX.WETH,
          shortToken:    GMX.USDC,
          name:          `${sym}/USD`,
          symbol:        sym,
          price,
          fundingRateHourly:     fundingHourly,
          fundingRateAnnualized: fundingHourly * 24 * 365 * 100,
          openInterestLong:  oiLong,
          openInterestShort: oiShort,
          utilization: oiLong + oiShort > 0
            ? (Math.min(oiLong, oiShort) / Math.max(oiLong, oiShort)) * 100
            : 0,
          volume24h: parseFloat(t.volumeUsd24h || "0") / 1e30,
        };
      });
  } catch (e) {
    console.warn("[GMX] Market data fetch failed:", e);
    // 返回静态示例数据（页面不崩溃）
    return getFallbackGMXMarkets();
  }
}

function getFallbackGMXMarkets(): GMXMarket[] {
  return [
    { marketToken: GMX.BTC_USD_Market, indexToken: "", longToken: GMX.WETH, shortToken: GMX.USDC, name: "BTC/USD", symbol: "BTC", price: 98000, fundingRateHourly: 0.000012, fundingRateAnnualized: 10.5, openInterestLong: 180_000_000, openInterestShort: 150_000_000, utilization: 83, volume24h: 450_000_000 },
    { marketToken: GMX.ETH_USD_Market, indexToken: "", longToken: GMX.WETH, shortToken: GMX.USDC, name: "ETH/USD", symbol: "ETH", price: 2700, fundingRateHourly: 0.000008, fundingRateAnnualized: 7.0,  openInterestLong: 90_000_000, openInterestShort: 75_000_000, utilization: 83, volume24h: 220_000_000 },
    { marketToken: GMX.SOL_USD_Market, indexToken: "", longToken: GMX.WETH, shortToken: GMX.USDC, name: "SOL/USD", symbol: "SOL", price: 185,  fundingRateHourly: 0.000020, fundingRateAnnualized: 17.5, openInterestLong: 30_000_000, openInterestShort: 22_000_000, utilization: 73, volume24h: 85_000_000 },
    { marketToken: GMX.ARB_USD_Market, indexToken: "", longToken: GMX.WETH, shortToken: GMX.USDC, name: "ARB/USD", symbol: "ARB", price: 0.35, fundingRateHourly: 0.000030, fundingRateAnnualized: 26.3, openInterestLong: 12_000_000, openInterestShort: 8_000_000, utilization: 67, volume24h: 28_000_000 },
  ];
}

// ---- 构建 GMX v2 开仓交易（Market Order）----
// 返回的 tx 需要通过 OKX 插件钱包签名
export function buildGMXOrderTx(params: {
  walletAddress: string;
  market:        string;  // market token 地址
  collateralToken: string;
  isLong:        boolean;
  sizeDeltaUsd:  bigint;  // 仓位大小（USD, 30位精度）
  collateralDeltaAmount: bigint;  // 保证金数量（token 精度）
  acceptablePrice: bigint; // 可接受价格（30位精度）
  executionFee:  bigint;  // LayerZero 执行费（wei）
}) {
  // GMX v2 createOrder ABI 编码（简化）
  // function createOrder((OrderType, DecreaseFees, bool, uint256, ...))
  const { walletAddress, market, collateralToken, isLong, sizeDeltaUsd, collateralDeltaAmount, acceptablePrice, executionFee } = params;

  // CreateOrderParams struct encoding
  // 实际部署时需使用完整 ABI，这里提供结构参考
  const ORDER_TYPE_MARKET_INCREASE = BigInt(2); // MarketIncrease

  // 先构建 approve USDC → OrderVault 的 tx
  const approveTx = {
    to:    collateralToken,
    data:  "0x095ea7b3"
      + GMX.OrderVault.slice(2).padStart(64, "0")
      + collateralDeltaAmount.toString(16).padStart(64, "0"),
    value: "0x0",
    from:  walletAddress,
    chainId: "0xa4b1", // Arbitrum = 42161
  };

  // 构建 createOrder tx（简化版，需完整 ABI 才能在链上执行）
  const createOrderTx = {
    to:    GMX.ExchangeRouter,
    data:  encodeGMXCreateOrder({
      receiver:       walletAddress,
      callbackContract: "0x0000000000000000000000000000000000000000",
      uiFeeReceiver:  "0x0000000000000000000000000000000000000000",
      market,
      initialCollateralToken: collateralToken,
      swapPath:       [],
      sizeDeltaUsd,
      initialCollateralDeltaAmount: collateralDeltaAmount,
      triggerPrice:   BigInt(0),
      acceptablePrice,
      executionFee,
      callbackGasLimit: BigInt(0),
      minOutputAmount: BigInt(0),
      orderType:      ORDER_TYPE_MARKET_INCREASE,
      decreasePositionSwapType: BigInt(0),
      isLong,
      shouldUnwrapNativeToken: false,
      referralCode:   "0x0000000000000000000000000000000000000000000000000000000000000000",
    }),
    value: `0x${executionFee.toString(16)}`,
    from:  walletAddress,
    chainId: "0xa4b1",
  };

  return [
    { step: 1, description: `授权 USDC 给 GMX OrderVault`, tx: approveTx },
    { step: 2, description: `GMX v2 ${isLong ? "做多" : "做空"} $${Number(sizeDeltaUsd / BigInt(1e28)).toFixed(0)}`, tx: createOrderTx },
  ];
}

// ---- ABI 编码工具（简化） ----
function encodeGMXCreateOrder(p: {
  receiver: string; callbackContract: string; uiFeeReceiver: string;
  market: string; initialCollateralToken: string; swapPath: string[];
  sizeDeltaUsd: bigint; initialCollateralDeltaAmount: bigint;
  triggerPrice: bigint; acceptablePrice: bigint; executionFee: bigint;
  callbackGasLimit: bigint; minOutputAmount: bigint;
  orderType: bigint; decreasePositionSwapType: bigint;
  isLong: boolean; shouldUnwrapNativeToken: boolean;
  referralCode: string;
}): string {
  // createOrder(CreateOrderParams) selector
  const selector = "0x36b4aab6";
  const pad = (v: string, len = 64) => v.replace("0x", "").padStart(len, "0");
  const padBig = (v: bigint) => v.toString(16).padStart(64, "0");
  const padBool = (v: boolean) => (v ? "1" : "0").padStart(64, "0");
  const padAddr = (v: string) => v.replace("0x", "").toLowerCase().padStart(64, "0");

  // Simplified encoding - offset for tuple at position 0
  const tupleOffset = "0000000000000000000000000000000000000000000000000000000000000020";
  const swapPathOffset = (17 * 32).toString(16).padStart(64, "0");
  const swapPathLen   = "0000000000000000000000000000000000000000000000000000000000000000";

  const encoded = [
    tupleOffset,
    padAddr(p.receiver),
    padAddr(p.callbackContract),
    padAddr(p.uiFeeReceiver),
    padAddr(p.market),
    padAddr(p.initialCollateralToken),
    swapPathOffset,
    padBig(p.sizeDeltaUsd),
    padBig(p.initialCollateralDeltaAmount),
    padBig(p.triggerPrice),
    padBig(p.acceptablePrice),
    padBig(p.executionFee),
    padBig(p.callbackGasLimit),
    padBig(p.minOutputAmount),
    padBig(p.orderType),
    padBig(p.decreasePositionSwapType),
    padBool(p.isLong),
    padBool(p.shouldUnwrapNativeToken),
    pad(p.referralCode),
    swapPathLen,
  ].join("");

  return selector + encoded;
}
