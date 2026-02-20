// ============================================
// DefiLlama API Integration
// Docs: https://defillama.com/docs/api
// ============================================

import { createLogger, type Pool, type Protocol, ProtocolCategory } from "@defi-yield/common";
import { DEFILLAMA_CHAIN_MAP, computeHealthScore } from "@defi-yield/common";

const logger = createLogger("scanner:defillama");

const YIELDS_BASE = "https://yields.llama.fi";
const API_BASE = "https://api.llama.fi";

// ---- Raw API Response Types ----

interface DefiLlamaPool {
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apyBase: number | null;
  apyReward: number | null;
  apy: number | null;
  rewardTokens: string[] | null;
  pool: string; // UUID
  apyPct1D: number | null;
  apyPct7D: number | null;
  apyPct30D: number | null;
  stablecoin: boolean;
  ilRisk: string;
  exposure: string;
  poolMeta: string | null;
  mu: number | null;
  sigma: number | null;
  count: number | null;
  outlier: boolean;
  underlyingTokens: string[] | null;
  il7d: number | null;
  apyBase7d: number | null;
  apyMean30d: number | null;
  volumeUsd1d: number | null;
  volumeUsd7d: number | null;
}

interface DefiLlamaYieldsResponse {
  status: string;
  data: DefiLlamaPool[];
}

interface DefiLlamaProtocol {
  id: string;
  name: string;
  slug: string;
  chains: string[];
  tvl: number;
  category: string;
  url: string;
  logo: string;
}

interface DefiLlamaPoolChart {
  timestamp: string;
  tvlUsd: number;
  apy: number;
  apyBase: number;
  apyReward: number;
  il7d: number | null;
  apyBase7d: number | null;
}

// ---- Public API ----

/**
 * Fetch all yield pools from DefiLlama
 */
export async function fetchAllPools(
  minTvlUsd = 100000,
  minAprPct = 1.0
): Promise<Pool[]> {
  logger.info("Fetching all pools from DefiLlama", { minTvlUsd, minAprPct });

  const res = await fetch(`${YIELDS_BASE}/pools`);
  if (!res.ok) {
    throw new Error(`DefiLlama API error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as DefiLlamaYieldsResponse;
  logger.info(`Received ${json.data.length} raw pools from DefiLlama`);

  const pools: Pool[] = [];

  for (const raw of json.data) {
    // Filter by TVL and APR
    if (raw.tvlUsd < minTvlUsd) continue;
    const totalApr = raw.apy ?? 0;
    if (totalApr < minAprPct) continue;

    // Map chain name
    const chain = DEFILLAMA_CHAIN_MAP[raw.chain];
    if (!chain) continue; // Skip unsupported chains

    pools.push({
      poolId: raw.pool,
      protocolId: raw.project,
      chain,
      symbol: raw.symbol,
      tokens: (raw.underlyingTokens || []).map((addr) => ({
        address: addr,
        symbol: "",
        decimals: 18,
      })),
      tvlUsd: raw.tvlUsd,
      aprBase: raw.apyBase ?? 0,
      aprReward: raw.apyReward ?? 0,
      aprTotal: totalApr,
      volume24hUsd: raw.volumeUsd1d ?? 0,
      isActive: true,
      // 计算健康分
      healthScore: computeHealthScore({
        tvlUsd: raw.tvlUsd,
        volume24hUsd: raw.volumeUsd1d ?? 0,
        metadata: {
          stablecoin: raw.stablecoin,
          ilRisk: raw.ilRisk,
          sigma: raw.sigma,
          outlier: raw.outlier,
        },
      }),
      metadata: {
        stablecoin: raw.stablecoin,
        ilRisk: raw.ilRisk,
        exposure: raw.exposure,
        poolMeta: raw.poolMeta,
        apyPct1D: raw.apyPct1D,
        apyPct7D: raw.apyPct7D,
        apyPct30D: raw.apyPct30D,
        apyMean30d: raw.apyMean30d,
        outlier: raw.outlier,
        il7d: raw.il7d,
        mu: raw.mu,
        sigma: raw.sigma,
      },
      lastScannedAt: new Date(),
    });
  }

  logger.info(`Filtered to ${pools.length} pools meeting criteria`);
  return pools;
}

/**
 * Fetch historical APR/TVL chart for a specific pool
 */
export async function fetchPoolChart(
  poolId: string
): Promise<DefiLlamaPoolChart[]> {
  const res = await fetch(`${YIELDS_BASE}/chart/${poolId}`);
  if (!res.ok) {
    throw new Error(`DefiLlama chart API error: ${res.status}`);
  }
  const json = (await res.json()) as { status: string; data: DefiLlamaPoolChart[] };
  return json.data;
}

/**
 * Fetch all protocols from DefiLlama
 */
export async function fetchAllProtocols(): Promise<Protocol[]> {
  logger.info("Fetching all protocols from DefiLlama");

  const res = await fetch(`${API_BASE}/protocols`);
  if (!res.ok) {
    throw new Error(`DefiLlama protocols API error: ${res.status}`);
  }

  const raw = (await res.json()) as DefiLlamaProtocol[];
  logger.info(`Received ${raw.length} protocols from DefiLlama`);

  const protocols: Protocol[] = [];

  for (const p of raw) {
    // Map category
    let category: ProtocolCategory;
    switch (p.category?.toLowerCase()) {
      case "dexes":
      case "dex":
        category = ProtocolCategory.DEX;
        break;
      case "lending":
      case "cdp":
        category = ProtocolCategory.LENDING;
        break;
      case "liquid staking":
        category = ProtocolCategory.STAKING;
        break;
      case "yield":
      case "yield aggregator":
      case "farm":
        category = ProtocolCategory.YIELD;
        break;
      case "bridge":
        category = ProtocolCategory.BRIDGE;
        break;
      case "derivatives":
        category = ProtocolCategory.DERIVATIVES;
        break;
      default:
        category = ProtocolCategory.DEX; // fallback for unknown categories
        // Unknown categories: options, insurance, perpetuals, algo-stables, etc.
        break;
    }

    // Create one entry per chain the protocol supports
    for (const chainName of p.chains) {
      const chain = DEFILLAMA_CHAIN_MAP[chainName];
      if (!chain) continue;

      protocols.push({
        protocolId: `${p.slug}-${chain}`,
        name: p.name,
        category,
        chain,
        websiteUrl: p.url,
        logoUrl: p.logo,
        tvlUsd: p.tvl ?? 0,
        isActive: true,
      });
    }
  }

  return protocols;
}
