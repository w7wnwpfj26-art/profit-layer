// ============================================
// On-Chain Data Source (direct RPC reads)
// Supplements DefiLlama with real-time on-chain data
// ============================================

import { createLogger, type Pool, type Chain, CHAIN_CONFIGS } from "@defi-yield/common";
import { createPublicClient, http, type PublicClient, parseAbi } from "viem";
import { mainnet, arbitrum, polygon, bsc, base, optimism, avalanche } from "viem/chains";

const logger = createLogger("scanner:onchain");

// ---- Viem chain object mapping (for createPublicClient) ----
const VIEM_CHAINS: Record<string, any> = {
  ethereum: mainnet,
  arbitrum: arbitrum,
  polygon: polygon,
  bsc: bsc,
  base: base,
  optimism: optimism,
  avalanche: avalanche,
};

// ---- Common ABIs ----
const ERC20_ABI = parseAbi([
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

const UNISWAP_V3_POOL_ABI = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)",
  "function fee() view returns (uint24)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);

const AAVE_POOL_ABI = parseAbi([
  "function getReserveData(address asset) view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
]);

// ---- Client cache ----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const clients: Map<string, any> = new Map();

function getClient(chain: Chain): PublicClient | null {
  if (clients.has(chain)) return clients.get(chain)!;
  const viemChain = VIEM_CHAINS[chain];
  const chainConfig = CHAIN_CONFIGS[chain];
  if (!viemChain || !chainConfig) return null;
  const client = createPublicClient({ chain: viemChain, transport: http(chainConfig.rpcUrl) });
  clients.set(chain, client as PublicClient);
  return client as PublicClient;
}

// ---- Public API ----

/**
 * Fetch real-time pool data directly from chain RPC.
 * Supplements DefiLlama with more current data.
 */
export async function fetchOnChainPoolData(
  chain: Chain,
  protocolId: string,
  poolAddresses: string[]
): Promise<Partial<Pool>[]> {
  logger.info("On-chain data fetch", { chain, protocolId, count: poolAddresses.length });

  const client = getClient(chain);
  if (!client) {
    logger.warn(`No RPC client for chain ${chain}`);
    return [];
  }

  const results: Partial<Pool>[] = [];

  for (const addr of poolAddresses) {
    try {
      if (protocolId.includes("uniswap") || protocolId.includes("sushi") || protocolId.includes("pancake")) {
        const data = await fetchUniV3PoolData(client, addr as `0x${string}`);
        if (data) results.push({ ...data, chain, protocolId });
      } else {
        // Generic ERC20 TVL check
        const data = await fetchGenericPoolTvl(client, addr as `0x${string}`);
        if (data) results.push({ ...data, chain, protocolId });
      }
    } catch (err) {
      logger.debug(`Failed to fetch on-chain data for ${addr}: ${(err as Error).message}`);
    }
  }

  logger.info(`Fetched on-chain data for ${results.length}/${poolAddresses.length} pools`);
  return results;
}

/**
 * Fetch Uniswap V3 style pool data
 */
async function fetchUniV3PoolData(
  client: PublicClient,
  poolAddress: `0x${string}`
): Promise<Partial<Pool> | null> {
  try {
    const [slot0, liquidity, fee, token0, token1] = await Promise.all([
      client.readContract({ address: poolAddress, abi: UNISWAP_V3_POOL_ABI, functionName: "slot0" }),
      client.readContract({ address: poolAddress, abi: UNISWAP_V3_POOL_ABI, functionName: "liquidity" }),
      client.readContract({ address: poolAddress, abi: UNISWAP_V3_POOL_ABI, functionName: "fee" }),
      client.readContract({ address: poolAddress, abi: UNISWAP_V3_POOL_ABI, functionName: "token0" }),
      client.readContract({ address: poolAddress, abi: UNISWAP_V3_POOL_ABI, functionName: "token1" }),
    ]);

    const [sym0, sym1] = await Promise.all([
      client.readContract({ address: token0, abi: ERC20_ABI, functionName: "symbol" }).catch(() => "???"),
      client.readContract({ address: token1, abi: ERC20_ABI, functionName: "symbol" }).catch(() => "???"),
    ]);

    return {
      poolId: poolAddress.toLowerCase(),
      symbol: `${sym0}-${sym1}`,
      feeTier: Number(fee) / 1_000_000,
      tokens: [
        { address: token0, symbol: sym0 as string, decimals: 18 },
        { address: token1, symbol: sym1 as string, decimals: 18 },
      ],
      metadata: {
        sqrtPriceX96: slot0[0].toString(),
        tick: Number(slot0[1]),
        liquidity: liquidity.toString(),
        onChainFetchedAt: new Date().toISOString(),
      },
    };
  } catch {
    return null;
  }
}

/**
 * Fetch generic pool TVL via token balance
 */
async function fetchGenericPoolTvl(
  client: PublicClient,
  poolAddress: `0x${string}`
): Promise<Partial<Pool> | null> {
  try {
    const balance = await client.getBalance({ address: poolAddress });
    return {
      poolId: poolAddress.toLowerCase(),
      metadata: {
        nativeBalance: balance.toString(),
        onChainFetchedAt: new Date().toISOString(),
      },
    };
  } catch {
    return null;
  }
}

/**
 * Fetch Aave V3 reserve data for a token
 */
export async function fetchAaveReserveData(
  chain: Chain,
  aavePoolAddress: string,
  assetAddress: string
): Promise<{ liquidityRate: number; variableBorrowRate: number } | null> {
  const client = getClient(chain);
  if (!client) return null;

  try {
    const data = await client.readContract({
      address: aavePoolAddress as `0x${string}`,
      abi: AAVE_POOL_ABI,
      functionName: "getReserveData",
      args: [assetAddress as `0x${string}`],
    });

    // Aave rates are in RAY (1e27)
    const RAY = 1e27;
    const reserveData = data as any;
    const liquidityRate = Number(reserveData.currentLiquidityRate) / RAY * 100;
    const variableBorrowRate = Number(reserveData.currentVariableBorrowRate) / RAY * 100;

    return { liquidityRate, variableBorrowRate };
  } catch (err) {
    logger.debug(`Aave reserve data fetch failed: ${(err as Error).message}`);
    return null;
  }
}
