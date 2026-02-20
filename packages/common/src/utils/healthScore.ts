// ============================================
// 单池健康分计算 (0-100)
// 维度：TVL 规模、Volume/TVL、APR 稳定性、稳定币/IL 风险、异常值惩罚
// ============================================

export interface PoolHealthInput {
  tvlUsd: number;
  volume24hUsd: number;
  aprTotal?: number;
  metadata?: {
    stablecoin?: boolean;
    ilRisk?: string;
    sigma?: number | null;
    outlier?: boolean;
  };
}

const MAX_SCORE = 100;
const MIN_SCORE = 0;

/**
 * TVL 规模分 (0-25)：TVL 越大越稳
 */
function scoreTvl(tvlUsd: number): number {
  if (tvlUsd >= 10_000_000) return 25;
  if (tvlUsd >= 1_000_000) return 20;
  if (tvlUsd >= 100_000) return 15;
  if (tvlUsd >= 50_000) return 10;
  if (tvlUsd >= 10_000) return 5;
  return 0;
}

/**
 * Volume/TVL 流动性利用率 (0-25)：适度周转率代表真实使用
 */
function scoreVolumeTvl(tvlUsd: number, volume24hUsd: number): number {
  if (tvlUsd <= 0) return 0;
  const ratio = volume24hUsd / tvlUsd;
  if (ratio >= 2) return 25;
  if (ratio >= 1) return 20;
  if (ratio >= 0.5) return 15;
  if (ratio >= 0.1) return 10;
  if (ratio >= 0.01) return 5;
  return 0;
}

/**
 * APR 稳定性 (0-20)：sigma 越小越稳
 */
function scoreAprStability(metadata?: PoolHealthInput["metadata"]): number {
  const sigma = metadata?.sigma;
  if (sigma == null || sigma <= 0) return 20;
  if (sigma < 10) return 18;
  if (sigma < 20) return 14;
  if (sigma < 40) return 8;
  return 0;
}

/**
 * 稳定币 / 低 IL 风险 (0-15)
 */
function scoreStableAndIl(metadata?: PoolHealthInput["metadata"]): number {
  let s = 0;
  if (metadata?.stablecoin === true) s += 10;
  const ilRisk = (metadata?.ilRisk ?? "").toLowerCase();
  if (ilRisk === "no" || ilRisk === "stable") s += 5;
  return Math.min(15, s);
}

/**
 * 异常值惩罚：DefiLlama 标记 outlier 的池子扣分
 */
function penaltyOutlier(metadata?: PoolHealthInput["metadata"]): number {
  return metadata?.outlier === true ? 15 : 0;
}

/**
 * 计算单池健康分 (0-100)
 */
export function computeHealthScore(input: PoolHealthInput): number {
  const { tvlUsd, volume24hUsd, metadata } = input;
  const raw =
    scoreTvl(tvlUsd) +
    scoreVolumeTvl(tvlUsd, volume24hUsd) +
    scoreAprStability(metadata) +
    scoreStableAndIl(metadata) -
    penaltyOutlier(metadata);
  return Math.round(Math.max(MIN_SCORE, Math.min(MAX_SCORE, raw)) * 100) / 100;
}
