/**
 * 资金费率套利引擎（Delta 中性策略）
 *
 * 核心逻辑：
 *   做多现货 + 做空永续合约 = Delta 中性
 *   净收益 = 资金费率收入 - 交易手续费 - 资金成本
 *
 * 风险控制：
 *   - 最大单仓位 / 最大总仓位
 *   - 最低年化阈值（净利润 > 设定值才开仓）
 *   - 强制止损（资金费率反转超阈值时平仓）
 */

import { OKXApiClient, getPublicFundingRate, getPublicTicker, type OKXConfig } from "./okx-api";

// ---- 配置 ----
export interface ArbConfig {
  minAnnualizedPct:  number;  // 最低年化阈值，默认 20%
  maxPositionUsd:    number;  // 单标的最大仓位 USD
  maxTotalUsd:       number;  // 总套利仓位上限 USD
  leverage:          number;  // 合约杠杆，默认 1（不加杠杆）
  slippagePct:       number;  // 预估滑点 %
  makerFeePct:       number;  // Maker 手续费 %（OKX SWAP 约 0.02%）
  exitFundingRatePct: number; // 资金费率低于此值时平仓（年化 %）
  simulated:         boolean;
}

export const DEFAULT_ARB_CONFIG: ArbConfig = {
  minAnnualizedPct:   20,
  maxPositionUsd:     5000,
  maxTotalUsd:        50000,
  leverage:           1,
  slippagePct:        0.05,
  makerFeePct:        0.02,
  exitFundingRatePct: 5,
  simulated:          true, // 默认模拟盘，上实盘前手动改
};

// ---- 机会评估 ----
export interface ArbOpportunity {
  instId:         string;   // 如 BTC-USDT-SWAP
  spotInstId:     string;   // 如 BTC-USDT
  symbol:         string;   // BTC
  fundingRate:    number;   // 当期资金费率（小数）
  annualizedPct:  number;   // 年化 %
  nextFundingTime: string;
  spotPrice:      number;
  swapPrice:      number;
  priceDiffPct:   number;   // (swap - spot) / spot %
  netAnnualizedPct: number; // 扣除手续费后年化
  viable:         boolean;
  reason:         string;
}

export async function scanArbOpportunities(
  symbols: string[],
  config: ArbConfig = DEFAULT_ARB_CONFIG
): Promise<ArbOpportunity[]> {
  const results = await Promise.allSettled(
    symbols.map(async (sym) => {
      const swapId  = `${sym}-USDT-SWAP`;
      const spotId  = `${sym}-USDT`;

      const [fr, spotTicker, swapTicker] = await Promise.all([
        getPublicFundingRate(swapId),
        getPublicTicker(spotId),
        getPublicTicker(swapId),
      ]);

      if (!fr || !spotTicker || !swapTicker) return null;

      const fundingRate   = parseFloat(fr.fundingRate);
      const annualizedPct = fundingRate * 3 * 365 * 100;
      const spotPrice     = parseFloat(spotTicker.last);
      const swapPrice     = parseFloat(swapTicker.last);
      const priceDiffPct  = ((swapPrice - spotPrice) / spotPrice) * 100;

      // 净年化 = 年化 - 手续费（开仓 + 平仓 各两笔，现货+合约）
      const feeDrag = config.makerFeePct * 4 + config.slippagePct * 2;
      const netAnnualizedPct = annualizedPct - feeDrag;

      const viable = fundingRate > 0 && netAnnualizedPct >= config.minAnnualizedPct;
      const reason = !viable
        ? fundingRate <= 0
          ? "资金费率为负（多头付费），不适合做空合约"
          : `净年化 ${netAnnualizedPct.toFixed(1)}% 低于阈值 ${config.minAnnualizedPct}%`
        : "满足开仓条件";

      return {
        instId:         swapId,
        spotInstId:     spotId,
        symbol:         sym,
        fundingRate,
        annualizedPct,
        nextFundingTime: fr.fundingTime,
        spotPrice,
        swapPrice,
        priceDiffPct,
        netAnnualizedPct,
        viable,
        reason,
      } satisfies ArbOpportunity;
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<ArbOpportunity> => r.status === "fulfilled" && r.value !== null)
    .map(r => r.value)
    .sort((a, b) => b.netAnnualizedPct - a.netAnnualizedPct);
}

// ---- 开仓：同时买现货 + 做空合约 ----
export interface OpenArbResult {
  ok:           boolean;
  spotOrderId?: string;
  swapOrderId?: string;
  error?:       string;
  sizeUsdt:     number;
  symbol:       string;
  spotPrice:    number;
}

export async function openArbPosition(
  client: OKXApiClient,
  opp: ArbOpportunity,
  sizeUsd: number,
  config: ArbConfig = DEFAULT_ARB_CONFIG
): Promise<OpenArbResult> {
  const sz = (sizeUsd / opp.spotPrice).toFixed(4);

  try {
    // 1. 先设置合约杠杆
    await client.setLeverage(opp.instId, String(config.leverage), "cross");

    // 2. 买现货（市价）
    const spotRes = await client.placeOrder({
      instId:  opp.spotInstId,
      tdMode:  "cash",
      side:    "buy",
      ordType: "market",
      sz,
    });

    // 3. 做空合约（市价）
    const swapRes = await client.placeOrder({
      instId:  opp.instId,
      tdMode:  "cross",
      side:    "sell",
      ordType: "market",
      sz,
      posSide: "short",
    });

    return {
      ok:           true,
      spotOrderId:  spotRes[0]?.ordId,
      swapOrderId:  swapRes[0]?.ordId,
      sizeUsdt:     sizeUsd,
      symbol:       opp.symbol,
      spotPrice:    opp.spotPrice,
    };
  } catch (err: any) {
    return { ok: false, error: err.message, sizeUsdt: sizeUsd, symbol: opp.symbol, spotPrice: opp.spotPrice };
  }
}

// ---- 平仓：卖现货 + 平空单 ----
export async function closeArbPosition(
  client: OKXApiClient,
  symbol: string,
  sz: string
): Promise<{ ok: boolean; error?: string }> {
  const swapId = `${symbol}-USDT-SWAP`;
  const spotId = `${symbol}-USDT`;

  try {
    await Promise.all([
      // 卖现货
      client.placeOrder({
        instId:  spotId,
        tdMode:  "cash",
        side:    "sell",
        ordType: "market",
        sz,
      }),
      // 平空仓
      client.closePosition(swapId, "cross", "short"),
    ]);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ---- 计算套利统计 ----
export function calcArbStats(positions: {
  symbol: string;
  sizeUsd: number;
  currentFundingRatePct: number;
  openTime: number;
  collectedFunding: number;
}[]) {
  const totalSizeUsd = positions.reduce((s, p) => s + p.sizeUsd, 0);
  const totalCollected = positions.reduce((s, p) => s + p.collectedFunding, 0);
  const avgAnnualized = positions.length
    ? positions.reduce((s, p) => s + p.currentFundingRatePct * 3 * 365, 0) / positions.length
    : 0;
  const holdingDays = positions.length
    ? Math.max(...positions.map(p => (Date.now() - p.openTime) / 86400000))
    : 0;

  return { totalSizeUsd, totalCollected, avgAnnualized, holdingDays };
}
