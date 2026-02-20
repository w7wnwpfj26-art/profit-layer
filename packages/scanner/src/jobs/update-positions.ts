// ============================================
// Position Value & PnL Update Job
// ============================================

import { createLogger, query, getRedisConnection } from "@profitlayer/common";

const logger = createLogger("scanner:update-positions");

// 链的 RPC 端点
const CHAIN_RPC: Record<string, string> = {
  ethereum: "https://1rpc.io/eth",
  arbitrum: "https://1rpc.io/arb",
  bsc: "https://1rpc.io/bnb",
  polygon: "https://1rpc.io/matic",
  base: "https://1rpc.io/base",
  optimism: "https://1rpc.io/op",
  avalanche: "https://1rpc.io/avax",
};

// 协议的 aToken/份额代币地址映射
const AAVE_V3_ATOKENS: Record<string, Record<string, string>> = {
  arbitrum: {
    // underlying token -> aToken
    "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1": "0xe50fA9b3c56FfB159cB0FCA61F5c9D750e8128c8", // WETH -> aWETH
    "0xaf88d065e77c8cC2239327C5EDb3A432268e5831": "0x724dc807b04555b71ed48a6896b6F41593b8C637", // USDC -> aUSDC
    "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9": "0x6ab707Aca953eDAeFBc4fD23bA73294241490620", // USDT -> aUSDT
    "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1": "0x82E64f49Ed5EC1bC6e43DAD4FC8Af9bb3A2312EE", // DAI -> aDAI
  },
  ethereum: {
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2": "0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8", // WETH -> aWETH
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": "0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c", // USDC -> aUSDC
  },
  base: {
    "0x4200000000000000000000000000000000000006": "0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7", // WETH -> aWETH
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB", // USDC -> aUSDC
  },
};

// 代币精度
const TOKEN_DECIMALS: Record<string, Record<string, number>> = {
  arbitrum: {
    "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1": 18, // WETH
    "0xaf88d065e77c8cC2239327C5EDb3A432268e5831": 6,  // USDC
    "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9": 6,  // USDT
    "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1": 18, // DAI
  },
  ethereum: {
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2": 18, // WETH
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": 6,  // USDC
  },
  base: {
    "0x4200000000000000000000000000000000000006": 18, // WETH
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": 6,  // USDC
  },
};

interface TokenInfo {
  symbol?: string;
  address: string;
  decimals?: number;
}

interface Position {
  positionId: string;
  poolId: string;
  walletAddress: string;
  chainId: string;
  protocolId: string;
  symbol: string;
  amountToken0: number;
  valueUsd: number;
  entryValueUsd: number;
  openedAt: Date;
  aprTotal: number;
  tokens: TokenInfo[];
}

/**
 * 基于 APR 和持仓时间估算收益
 * 注意：允许返回负值以反映实际亏损情况（如 APR 下跌）
 */
function estimateYieldByAPR(entryValue: number, aprPercent: number, openedAt: Date): number {
  const now = new Date();
  const holdingDays = (now.getTime() - openedAt.getTime()) / (1000 * 60 * 60 * 24);
  // 估算收益 = 入场金额 × APR% × (持仓天数/365)
  // 允许负值以反映实际亏损
  const estimatedYield = entryValue * (aprPercent / 100) * (holdingDays / 365);
  return estimatedYield;
}

/**
 * 通过 RPC 查询 ERC20 余额
 */
async function getERC20Balance(
  rpcUrl: string,
  tokenAddress: string,
  walletAddress: string,
  decimals: number
): Promise<number> {
  try {
    const data = "0x70a08231" + walletAddress.replace("0x", "").padStart(64, "0");
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [{ to: tokenAddress, data }, "latest"],
        id: 1,
      }),
    });
    const json = (await res.json()) as { result?: string; error?: unknown };
    if (json.error || !json.result) return 0;
    const balance = BigInt(json.result);
    return Number(balance) / Math.pow(10, decimals);
  } catch (err) {
    logger.warn("Failed to fetch ERC20 balance", { tokenAddress, error: (err as Error).message });
    return 0;
  }
}

/**
 * 从 Redis 获取代币价格
 */
async function getTokenPrices(): Promise<Record<string, number>> {
  const redis = getRedisConnection();
  const pricesJson = await redis.get("prices:latest");
  if (!pricesJson) return {};
  
  const prices = JSON.parse(pricesJson);
  return {
    ETH: prices.ethereum?.usd || 0,
    WETH: prices.ethereum?.usd || 0,
    BNB: prices.binancecoin?.usd || 0,
    MATIC: prices["polygon-ecosystem-token"]?.usd || 0,
    POL: prices["polygon-ecosystem-token"]?.usd || 0,
    AVAX: prices["avalanche-2"]?.usd || 0,
    SOL: prices.solana?.usd || 0,
    APT: prices.aptos?.usd || 0,
    SUI: prices.sui?.usd || 0,
    USDC: 1,
    USDT: 1,
    DAI: 1,
  };
}

/**
 * 更新 Aave V3 持仓的价值
 */
async function updateAaveV3Position(
  position: Position,
  prices: Record<string, number>
): Promise<{ valueUsd: number; amountToken0: number } | null> {
  const chainId = position.chainId;
  const rpcUrl = CHAIN_RPC[chainId];
  if (!rpcUrl) return null;

  const aTokens = AAVE_V3_ATOKENS[chainId];
  const decimalsMap = TOKEN_DECIMALS[chainId];
  if (!aTokens || !decimalsMap) return null;

  // 从 pool 的 tokens 获取底层代币地址
  let underlyingToken: string | null = null;
  if (position.tokens && position.tokens.length > 0) {
    // tokens 可能是字符串数组或对象数组
    const firstToken = position.tokens[0];
    if (typeof firstToken === "string") {
      underlyingToken = firstToken;
    } else if (firstToken && typeof firstToken === "object" && "address" in firstToken) {
      underlyingToken = firstToken.address;
    }
  }
  
  // 如果没有 tokens，根据 symbol 推断
  if (!underlyingToken) {
    const symbolToToken: Record<string, Record<string, string>> = {
      arbitrum: {
        WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
        USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
        DAI: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
      },
    };
    underlyingToken = symbolToToken[chainId]?.[position.symbol];
  }

  if (!underlyingToken) {
    logger.warn("Cannot determine underlying token", { positionId: position.positionId, symbol: position.symbol });
    return null;
  }

  const aToken = aTokens[underlyingToken];
  const decimals = decimalsMap[underlyingToken];
  if (!aToken || decimals === undefined) {
    logger.warn("No aToken mapping found", { underlyingToken, chainId });
    return null;
  }

  // 查询 aToken 余额
  const aTokenBalance = await getERC20Balance(rpcUrl, aToken, position.walletAddress, decimals);
  
  // 获取代币价格
  const tokenPrice = prices[position.symbol] || 0;
  const valueUsd = aTokenBalance * tokenPrice;

  logger.debug("Updated Aave V3 position", {
    positionId: position.positionId,
    symbol: position.symbol,
    aTokenBalance,
    tokenPrice,
    valueUsd,
  });

  return { valueUsd, amountToken0: aTokenBalance };
}

/**
 * 主更新函数
 */
export async function runPositionUpdate(): Promise<void> {
  logger.info("Starting position value update");

  try {
    // 获取所有活跃持仓
    const result = await query(`
      SELECT p.position_id, p.pool_id, p.wallet_address, p.chain_id,
             p.amount_token0, p.value_usd, p.opened_at,
             pl.protocol_id, pl.symbol, pl.tokens, pl.apr_total
      FROM positions p
      LEFT JOIN pools pl ON p.pool_id = pl.pool_id
      WHERE p.status = 'active'
    `);

    if (result.rows.length === 0) {
      logger.info("No active positions to update");
      return;
    }

    logger.info(`Found ${result.rows.length} active positions to update`);

    // 获取价格
    const prices = await getTokenPrices();
    logger.debug("Token prices", { prices });

    let updatedCount = 0;

    for (const row of result.rows) {
      const position: Position = {
        positionId: row.position_id,
        poolId: row.pool_id,
        walletAddress: row.wallet_address,
        chainId: row.chain_id,
        protocolId: row.protocol_id || "",
        symbol: row.symbol || "",
        amountToken0: Number(row.amount_token0) || 0,
        valueUsd: Number(row.value_usd) || 0,
        entryValueUsd: Number(row.value_usd) || 0,
        openedAt: new Date(row.opened_at || Date.now()),
        aprTotal: Number(row.apr_total) || 0,
        tokens: row.tokens || [],
      };

      let newValue: { valueUsd: number; amountToken0: number } | null = null;
      let unrealizedPnl = 0;

      // 根据协议类型调用不同的更新逻辑
      if (position.protocolId.includes("aave")) {
        newValue = await updateAaveV3Position(position, prices);
        if (newValue && newValue.valueUsd > 0) {
          unrealizedPnl = newValue.valueUsd - position.entryValueUsd;
        }
      } else {
        // 其他协议（如 Beefy）：基于 APR 和持仓时间估算收益
        unrealizedPnl = estimateYieldByAPR(position.entryValueUsd, position.aprTotal, position.openedAt);
        newValue = { valueUsd: position.valueUsd, amountToken0: position.amountToken0 };
        logger.debug("APR-based yield estimation", {
          positionId: position.positionId,
          protocol: position.protocolId,
          apr: position.aprTotal,
          entryValue: position.entryValueUsd,
          estimatedYield: unrealizedPnl,
        });
      }

      if (unrealizedPnl > 0 || (newValue && newValue.valueUsd > 0)) {
        await query(`
          UPDATE positions
          SET value_usd = $1,
              amount_token0 = $2,
              unrealized_pnl_usd = $3,
              updated_at = NOW()
          WHERE position_id = $4
        `, [
          newValue?.valueUsd || position.valueUsd,
          newValue?.amountToken0 || position.amountToken0,
          unrealizedPnl,
          position.positionId
        ]);

        updatedCount++;
        logger.info("Position updated", {
          positionId: position.positionId,
          protocol: position.protocolId,
          oldValue: position.valueUsd,
          newValue: newValue?.valueUsd,
          unrealizedPnl,
        });
      }
    }

    logger.info(`Position update complete. Updated ${updatedCount}/${result.rows.length} positions`);

    // 记录审计日志
    await query(
      `INSERT INTO audit_log (event_type, severity, source, message, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        "position_update_complete",
        "info",
        "scanner",
        `Updated ${updatedCount} positions`,
        JSON.stringify({ updatedCount, totalPositions: result.rows.length }),
      ]
    ).catch(() => {});

  } catch (err) {
    logger.error("Position update failed", { error: (err as Error).message });
  }
}
