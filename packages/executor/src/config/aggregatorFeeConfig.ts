// ============================================
// 聚合器费用策略：按来源细化 gas / 滑点参数
// ============================================

/**
 * 按聚合器来源的滑点（%）
 * - 1inch/0x 通常报价稳定，可偏紧
 * - Paraswap/Uniswap 回退路径可略松以防限流后价格波动
 */
export const AGGREGATOR_SLIPPAGE_PCT: Record<string, number> = {
  "1inch": 0.5,
  "0x": 0.5,
  paraswap: 1,
  "uniswap-v3": 1,
  openclaw: 1,
  jupiter: 0.5,
  "thala-router": 1,
};

/**
 * 按聚合器来源的 gas 乘数（>=1）
 * - 用于执行时在 GasOptimizer 结果上再乘一层，应对不同路由的 gas 波动
 */
export const AGGREGATOR_GAS_MULTIPLIER: Record<string, number> = {
  "1inch": 1,
  "0x": 1,
  paraswap: 1.1,
  "uniswap-v3": 1.2,
  openclaw: 1,
  jupiter: 1,
  "thala-router": 1.1,
};

export function getSlippageForAggregator(aggregator: string, fallbackPct?: number): number {
  return AGGREGATOR_SLIPPAGE_PCT[aggregator] ?? fallbackPct ?? 0.5;
}

export function getGasMultiplierForAggregator(aggregator: string): number {
  const v = AGGREGATOR_GAS_MULTIPLIER[aggregator];
  return v != null && v >= 1 ? v : 1;
}
