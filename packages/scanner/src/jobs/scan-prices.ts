// ============================================
// Price Scanning Job
// ============================================

import { createLogger, query, getRedisConnection } from "@profitlayer/common";

const logger = createLogger("scanner:scan-prices");

interface CoinGeckoPrice {
  [id: string]: { usd: number };
}

const NATIVE_TOKEN_IDS: Record<string, string> = {
  ethereum: "ethereum",
  arbitrum: "ethereum",
  bsc: "binancecoin",
  polygon: "polygon-ecosystem-token",
  base: "ethereum",
  optimism: "ethereum",
  avalanche: "avalanche-2",
  aptos: "aptos",
  solana: "solana",
  sui: "sui",
};

/**
 * Fetch native token prices from CoinGecko (free API).
 */
export async function runPriceScan(): Promise<void> {
  logger.info("Starting price scan");

  const ids = [...new Set(Object.values(NATIVE_TOKEN_IDS))].join(",");

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
    );

    if (!res.ok) {
      throw new Error(`CoinGecko API error: ${res.status}`);
    }

    const prices = (await res.json()) as CoinGeckoPrice;
    logger.info("Fetched native token prices", { prices });

    // Store prices in Redis for quick access
    const redis = getRedisConnection();
    await redis.set("prices:latest", JSON.stringify(prices), "EX", 120); // 2 min TTL

    // Also log for audit
    await query(
      `INSERT INTO audit_log (event_type, severity, source, message, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        "price_scan_complete",
        "info",
        "scanner",
        "Native token prices updated",
        JSON.stringify(prices),
      ]
    ).catch(() => {});
  } catch (err) {
    logger.error("Price scan failed", { error: (err as Error).message });
  }
}
