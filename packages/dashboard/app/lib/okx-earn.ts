/**
 * DeFi 数据适配器
 * 使用 DefiLlama API 获取所有 DeFi 协议数据（包括 OKX Earn 上的协议）
 */

const DEFILLAMA_API = "https://yields.llama.fi";

export interface DeFiPool {
  id: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number;
  apyBase: number;
  apyReward: number | null;
  stablecoin: boolean;
  ilRisk: string;
  exposure: string;
  rewardTokens: string[] | null;
}

export interface OKXEarnProduct {
  id: string;
  name: string;
  platform: string;
  platformId: string;
  chainId: number;
  chainName: string;
  type: string;
  typeName: string;
  apy: number;
  rateType: "APY" | "APR";
  tvl: number;
  tokens: Array<{
    symbol: string;
    address: string;
    isNative: boolean;
  }>;
}

export type OKXEarnQueryParams = {
  network?: string;
  investType?: string;
  limit?: number;
  offset?: number;
  sortBy?: "TVL" | "RATE";
  sortOrder?: "ASC" | "DESC";
};

/**
 * 从 DefiLlama 获取所有 DeFi 池子数据
 */
export async function queryDefiLlamaPools(
  limit: number = 100,
  minTvl: number = 100000
): Promise<DeFiPool[]> {
  try {
    const response = await fetch(`${DEFILLAMA_API}/pools`, {
      next: { revalidate: 300 }, // 5分钟缓存
    });
    
    if (!response.ok) {
      console.error("[DefiLlama] API error:", response.status);
      return [];
    }
    
    const data = await response.json();
    
    // 过滤并排序
    const pools: DeFiPool[] = (data.data || [])
      .filter((p: any) => p.tvlUsd >= minTvl && p.apy > 0)
      .map((p: any) => ({
        id: p.pool,
        chain: p.chain,
        project: p.project,
        symbol: p.symbol,
        tvlUsd: p.tvlUsd || 0,
        apy: p.apy || 0,
        apyBase: p.apyBase || 0,
        apyReward: p.apyReward,
        stablecoin: p.stablecoin || false,
        ilRisk: p.ilRisk || "unknown",
        exposure: p.exposure || "unknown",
        rewardTokens: p.rewardTokens,
      }))
      .sort((a: DeFiPool, b: DeFiPool) => b.tvlUsd - a.tvlUsd)
      .slice(0, limit);
    
    return pools;
  } catch (err) {
    console.error("[DefiLlama] Fetch failed:", err);
    return [];
  }
}

/**
 * 转换 DefiLlama 数据为 OKXEarnProduct 格式（兼容现有代码）
 */
export function convertToOKXFormat(pool: DeFiPool): OKXEarnProduct {
  return {
    id: pool.id,
    name: pool.symbol,
    platform: pool.project,
    platformId: pool.project.toLowerCase().replace(/[^a-z0-9]/g, "-"),
    chainId: getChainId(pool.chain),
    chainName: pool.chain,
    type: pool.stablecoin ? "savings" : pool.exposure === "single" ? "staking" : "liquidity",
    typeName: pool.stablecoin ? "储蓄" : pool.exposure === "single" ? "质押" : "流动性挖矿",
    apy: pool.apy,
    rateType: "APY",
    tvl: pool.tvlUsd,
    tokens: [{
      symbol: pool.symbol.split("-")[0],
      address: "",
      isNative: false,
    }],
  };
}

function getChainId(chain: string): number {
  const chainIds: Record<string, number> = {
    "Ethereum": 1,
    "BSC": 56,
    "BNB Chain": 56,
    "Arbitrum": 42161,
    "Optimism": 10,
    "Base": 8453,
    "Polygon": 137,
    "Avalanche": 43114,
    "Solana": 0,
    "Sui": 0,
    "Aptos": 0,
  };
  return chainIds[chain] || 0;
}

/**
 * 获取所有网络的产品（兼容旧 API）
 */
export async function queryAllNetworksProducts(
  limit: number = 30
): Promise<OKXEarnProduct[]> {
  const pools = await queryDefiLlamaPools(limit * 2, 1000000);
  return pools.map(convertToOKXFormat).slice(0, limit);
}

/**
 * 查询 OKX Earn 产品（兼容旧代码）
 */
export async function queryOKXEarnProducts(params: {
  network?: string;
  investType?: string;
  limit?: number;
  offset?: number;
  sortBy?: "TVL" | "RATE";
  sortOrder?: "ASC" | "DESC";
} = {}): Promise<{ products: OKXEarnProduct[]; total: number }> {
  const { network, limit = 50, sortBy = "TVL", sortOrder = "DESC" } = params;
  
  let pools = await queryDefiLlamaPools(200, 100000);
  
  // 过滤网络
  if (network) {
    const networkMap: Record<string, string> = {
      "ETH": "Ethereum",
      "BSC": "BSC",
      "ARBITRUM": "Arbitrum",
      "OPTIMISM": "Optimism",
      "BASE": "Base",
      "POLYGON": "Polygon",
    };
    const chainName = networkMap[network] || network;
    pools = pools.filter(p => p.chain.toLowerCase() === chainName.toLowerCase());
  }
  
  // 排序
  if (sortBy === "RATE") {
    pools.sort((a, b) => sortOrder === "DESC" ? b.apy - a.apy : a.apy - b.apy);
  } else {
    pools.sort((a, b) => sortOrder === "DESC" ? b.tvlUsd - a.tvlUsd : a.tvlUsd - b.tvlUsd);
  }
  
  const products = pools.slice(0, limit).map(convertToOKXFormat);
  
  return {
    products,
    total: pools.length,
  };
}

/**
 * 格式化为池子列表兼容格式
 */
export function formatAsPoolData(product: OKXEarnProduct) {
  return {
    id: `defi-${product.id}`,
    protocol: product.platform,
    chain: product.chainName,
    chainId: product.chainId,
    pool: product.name,
    tvl: product.tvl,
    apr: product.apy,
    aprType: product.rateType,
    healthScore: calculateHealthScore(product),
    tokens: product.tokens.map((t) => t.symbol),
    type: product.type,
    source: "defillama",
  };
}

function calculateHealthScore(product: OKXEarnProduct): number {
  let score = 50;

  // TVL 加分
  if (product.tvl > 1_000_000_000) score += 30;
  else if (product.tvl > 100_000_000) score += 25;
  else if (product.tvl > 10_000_000) score += 15;
  else if (product.tvl > 1_000_000) score += 10;

  // APY 合理性
  if (product.apy > 0 && product.apy < 20) score += 15;
  else if (product.apy >= 20 && product.apy < 50) score += 10;
  else if (product.apy >= 50 && product.apy < 100) score += 5;
  else if (product.apy > 500) score -= 20;

  // 知名协议加分
  const trustedPlatforms = ["aave", "lido", "compound", "makerdao", "curve", "uniswap", "convex", "yearn", "rocket-pool", "frax"];
  if (trustedPlatforms.some((p) => product.platform.toLowerCase().includes(p))) {
    score += 5;
  }

  return Math.max(0, Math.min(100, score));
}
