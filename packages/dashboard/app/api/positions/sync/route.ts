import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";

const CHAIN_RPC: Record<string, string> = {
  ethereum: "https://1rpc.io/eth",
  arbitrum: "https://1rpc.io/arb",
  bsc: "https://1rpc.io/bnb",
  polygon: "https://1rpc.io/matic",
  base: "https://1rpc.io/base",
  optimism: "https://1rpc.io/op",
  avalanche: "https://1rpc.io/avax",
};

const AAVE_V3_ATOKENS: Record<string, Record<string, { aToken: string; decimals: number; symbol: string }>> = {
  arbitrum: {
    "0xaf88d065e77c8cC2239327C5EDb3A432268e5831": { aToken: "0x724dc807b04555b71ed48a6896b6F41593b8C637", decimals: 6, symbol: "USDC" },
    "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1": { aToken: "0xe50fA9b3c56FfB159cB0FCA61F5c9D750e8128c8", decimals: 18, symbol: "WETH" },
    "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9": { aToken: "0x6ab707Aca953eDAeFBc4fD23bA73294241490620", decimals: 6, symbol: "USDT" },
    "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1": { aToken: "0x82E64f49Ed5EC1bC6e43DAD4FC8Af9bb3A2312EE", decimals: 18, symbol: "DAI" },
  },
  base: {
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": { aToken: "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB", decimals: 6, symbol: "USDC" },
    "0x4200000000000000000000000000000000000006": { aToken: "0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7", decimals: 18, symbol: "WETH" },
  },
};

// Moonwell mToken 地址
const MOONWELL_MTOKENS: Record<string, Record<string, { mToken: string; decimals: number; symbol: string }>> = {
  base: {
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": { mToken: "0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22", decimals: 6, symbol: "USDC" },
  },
};

const SYMBOL_TO_UNDERLYING: Record<string, Record<string, string>> = {
  arbitrum: {
    USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    DAI: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
  },
  base: {
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    WETH: "0x4200000000000000000000000000000000000006",
  },
};

async function getERC20Balance(rpcUrl: string, tokenAddress: string, wallet: string, decimals: number): Promise<number> {
  try {
    const data = "0x70a08231" + wallet.replace("0x", "").padStart(64, "0");
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_call", params: [{ to: tokenAddress, data }, "latest"], id: 1 }),
    });
    const json = (await res.json()) as { result?: string; error?: unknown };
    if (json.error || !json.result || json.result === "0x") return 0;
    return Number(BigInt(json.result)) / Math.pow(10, decimals);
  } catch {
    return 0;
  }
}

// 价格缓存（统一 TTL = 30 秒）
let priceCache: { prices: Record<string, number>; timestamp: number } | null = null;
const PRICE_CACHE_TTL = 30000;

async function getTokenPrices(): Promise<Record<string, number>> {
  const now = Date.now();
  if (priceCache && now - priceCache.timestamp < PRICE_CACHE_TTL) {
    return priceCache.prices;
  }
  
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,usd-coin,tether,dai,polygon-ecosystem-token&vs_currencies=usd",
      { next: { revalidate: 30 }, signal: AbortSignal.timeout(8000) }
    );
    const data = (await res.json()) as Record<string, { usd?: number }>;
    
    const prices: Record<string, number> = {
      ETH: data.ethereum?.usd ?? 2100,
      WETH: data.ethereum?.usd ?? 2100,
      USDC: data["usd-coin"]?.usd ?? 1,
      USDT: data.tether?.usd ?? 1,
      DAI: data.dai?.usd ?? 1,
      POL: data["polygon-ecosystem-token"]?.usd ?? 0.11,
      MATIC: data["polygon-ecosystem-token"]?.usd ?? 0.11,
    };
    
    // 更新缓存
    priceCache = { prices, timestamp: now };
    return prices;
  } catch {
    return { ETH: 2100, WETH: 2100, USDC: 1, USDT: 1, DAI: 1, POL: 0.11, MATIC: 0.11 };
  }
}

/**
 * 基于 APR 和持仓时间估算收益
 * 注意：允许返回负值以反映实际亏损情况（如代币价格下跌）
 */
function estimateYieldByAPR(entryValue: number, aprPercent: number, openedAt: Date): number {
  const holdingDays = (Date.now() - openedAt.getTime()) / (1000 * 60 * 60 * 24);
  // 允许负值以反映实际亏损
  return entryValue * (aprPercent / 100) * (holdingDays / 365);
}

export async function POST() {
  const pool = getPool();
  try {
    const result = await pool.query(`
      SELECT p.position_id, p.pool_id, p.wallet_address, p.chain_id,
             p.amount_token0, p.value_usd, p.entry_value_usd, p.opened_at,
             pl.protocol_id, pl.symbol, pl.tokens, pl.apr_total
      FROM positions p
      LEFT JOIN pools pl ON p.pool_id = pl.pool_id
      WHERE p.status = 'active'
    `);

    if (result.rows.length === 0) {
      return NextResponse.json({ success: true, message: "没有活跃持仓", updated: 0 });
    }

    const prices = await getTokenPrices();
    let updated = 0;
    const details: Array<{ positionId: string; oldValue: number; newValue: number; pnl: number }> = [];

    for (const row of result.rows) {
      const chainId = row.chain_id;
      const protocolId = row.protocol_id || "";
      const symbol = row.symbol || "";
      const wallet = row.wallet_address;
      const entryValue = Number(row.entry_value_usd) || Number(row.value_usd) || 0;
      const oldValue = Number(row.value_usd) || 0;
      const openedAt = new Date(row.opened_at || Date.now());
      const aprTotal = Number(row.apr_total) || 0;
      const rpcUrl = CHAIN_RPC[chainId];

      let newValueUsd = oldValue;
      let newAmount = Number(row.amount_token0) || 0;
      let unrealizedPnl = 0;

      if (rpcUrl && protocolId.includes("aave")) {
        // Aave V3: 查询 aToken 余额
        const primarySymbol = symbol.split(/[-\/]/)[0].trim().toUpperCase();
        const underlying = SYMBOL_TO_UNDERLYING[chainId]?.[primarySymbol];
        const aTokenInfo = underlying ? AAVE_V3_ATOKENS[chainId]?.[underlying] : null;

        if (aTokenInfo) {
          const balance = await getERC20Balance(rpcUrl, aTokenInfo.aToken, wallet, aTokenInfo.decimals);
          newAmount = balance;
          if (balance > 0) {
            const price = prices[primarySymbol] || prices[aTokenInfo.symbol] || 1;
            newValueUsd = balance * price;
            unrealizedPnl = newValueUsd - entryValue;
          } else {
            newValueUsd = 0;
            unrealizedPnl = -entryValue;
          }
        }
      } else if (rpcUrl && protocolId.includes("moonwell")) {
        // Moonwell: 查询 mToken 余额（底层资产余额）
        const primarySymbol = symbol.split(/[-\/]/)[0].trim().toUpperCase();
        const underlying = SYMBOL_TO_UNDERLYING[chainId]?.[primarySymbol];
        const mTokenInfo = underlying ? MOONWELL_MTOKENS[chainId]?.[underlying] : null;

        if (mTokenInfo) {
          // Moonwell mToken 的 balanceOfUnderlying 需要 send transaction，用 balanceOf 近似
          const balance = await getERC20Balance(rpcUrl, mTokenInfo.mToken, wallet, mTokenInfo.decimals);
          newAmount = balance;
          if (balance > 0) {
            const price = prices[primarySymbol] || 1;
            newValueUsd = balance * price;
            unrealizedPnl = newValueUsd - entryValue;
          } else {
            newValueUsd = 0;
            unrealizedPnl = -entryValue;
          }
        } else {
          // fallback: APR 估算
          unrealizedPnl = estimateYieldByAPR(entryValue, aprTotal, openedAt);
          newValueUsd = entryValue + unrealizedPnl;
        }
      } else {
        // 其他协议: APR 估算
        unrealizedPnl = estimateYieldByAPR(entryValue, aprTotal, openedAt);
        newValueUsd = entryValue + unrealizedPnl;
      }

      if (newValueUsd < 0.01 && newAmount < 0.0001) {
        // 如果余额接近 0，自动标记为已关闭
        await pool.query(
          `UPDATE positions SET value_usd = 0, amount_token0 = 0, status = 'closed', closed_at = NOW(), updated_at = NOW() WHERE position_id = $1`,
          [row.position_id]
        );
      } else {
        await pool.query(
          `UPDATE positions SET value_usd = $1, amount_token0 = $2, unrealized_pnl_usd = $3, updated_at = NOW() WHERE position_id = $4`,
          [newValueUsd, newAmount, unrealizedPnl, row.position_id]
        );
      }
      updated++;
      details.push({ positionId: row.position_id, oldValue, newValue: newValueUsd, pnl: unrealizedPnl });
    }

    // 审计日志
    try {
      await pool.query(
        `INSERT INTO audit_log (event_type, severity, source, message, metadata) VALUES ($1, $2, $3, $4, $5)`,
        ["position_sync", "info", "dashboard", `同步了 ${updated} 个持仓`, JSON.stringify({ updated, details })]
      );
    } catch {}

    return NextResponse.json({ success: true, updated, details });
  } catch (err) {
    console.error("Position sync error:", err);
    return NextResponse.json({ error: "同步失败", message: (err as Error).message }, { status: 500 });
  }
}
