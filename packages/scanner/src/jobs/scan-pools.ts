// ============================================
// Pool Scanning Job
// ============================================

import {
  createLogger,
  query,
  createQueue,
  QUEUES,
  computeHealthScore,
  type Pool,
  type StrategyComputeJob,
} from "@defi-yield/common";
import { fetchAllPools } from "../sources/defillama.js";

const logger = createLogger("scanner:scan-pools");

/**
 * Upsert pools into database and publish events.
 */
async function upsertPools(pools: Pool[]): Promise<number> {
  let upserted = 0;

  for (const pool of pools) {
    try {
      const healthScore = computeHealthScore({
        tvlUsd: pool.tvlUsd,
        volume24hUsd: pool.volume24hUsd,
        aprTotal: pool.aprTotal,
        metadata: pool.metadata,
      });

      // Upsert the pool record
      await query(
        `INSERT INTO pools (
          pool_id, protocol_id, chain_id, symbol, tokens,
          pool_type, tvl_usd, apr_base, apr_reward, apr_total,
          volume_24h_usd, is_active, metadata, health_score, last_scanned_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
        ON CONFLICT (pool_id) DO UPDATE SET
          tvl_usd = EXCLUDED.tvl_usd,
          apr_base = EXCLUDED.apr_base,
          apr_reward = EXCLUDED.apr_reward,
          apr_total = EXCLUDED.apr_total,
          volume_24h_usd = EXCLUDED.volume_24h_usd,
          metadata = EXCLUDED.metadata,
          health_score = EXCLUDED.health_score,
          last_scanned_at = NOW(),
          updated_at = NOW()`,
        [
          pool.poolId,
          pool.protocolId,
          pool.chain,
          pool.symbol,
          JSON.stringify(pool.tokens),
          pool.poolType || null,
          pool.tvlUsd,
          pool.aprBase,
          pool.aprReward,
          pool.aprTotal,
          pool.volume24hUsd,
          pool.isActive,
          JSON.stringify(pool.metadata || {}),
          healthScore,
        ]
      );

      // Insert time-series snapshot
      await query(
        `INSERT INTO pool_snapshots (time, pool_id, tvl_usd, apr_base, apr_reward, apr_total, volume_24h_usd)
         VALUES (NOW(), $1, $2, $3, $4, $5, $6)`,
        [pool.poolId, pool.tvlUsd, pool.aprBase, pool.aprReward, pool.aprTotal, pool.volume24hUsd]
      );

      upserted++;
    } catch (err) {
      // Pool might reference a protocol_id that doesn't exist yet - skip
      logger.warn(`Failed to upsert pool ${pool.poolId}`, {
        error: (err as Error).message,
      });
    }
  }

  return upserted;
}

/**
 * Guess protocol category from protocol ID when metadata is unavailable.
 */
function guessProtocolCategory(protocolId: string): string {
  const id = protocolId.toLowerCase();
  if (id.includes("aave") || id.includes("compound") || id.includes("morpho")) return "lending";
  if (id.includes("lido") || id.includes("rocket") || id.includes("marinade") || id.includes("staked")) return "staking";
  if (id.includes("yearn") || id.includes("beefy") || id.includes("convex")) return "yield";
  return "dex"; // default for most DEX protocols
}

/**
 * Ensure protocol records exist for all pools.
 */
async function ensureProtocols(pools: Pool[]): Promise<void> {
  const seen = new Set<string>();

  for (const pool of pools) {
    const key = `${pool.protocolId}-${pool.chain}`;
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      // Infer category from pool metadata or guess from protocol ID
      const category = pool.metadata?.category || guessProtocolCategory(pool.protocolId);

      await query(
        `INSERT INTO protocols (protocol_id, name, category, chain_id, is_active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (protocol_id, chain_id) DO UPDATE SET updated_at = NOW()`,
        [pool.protocolId, pool.protocolId, category, pool.chain]
      );
    } catch {
      // Ignore - chain_id FK might not exist
    }
  }
}

/**
 * Main scan job: fetch pools from DefiLlama, store in DB, publish event.
 */
export async function runPoolScan(
  minTvlUsd?: number,
  minAprPct?: number
): Promise<void> {
  logger.info("Starting pool scan");
  const startTime = Date.now();

  try {
    // 1. Fetch all pools
    const pools = await fetchAllPools(minTvlUsd, minAprPct);
    logger.info(`Fetched ${pools.length} pools`);

    // 2. Ensure protocols exist
    await ensureProtocols(pools);

    // 3. Upsert into database
    const upserted = await upsertPools(pools);
    logger.info(`Upserted ${upserted} pools into database`);

    // 4. Publish event to strategy computation queue
    const strategyQueue = createQueue(QUEUES.STRATEGY_COMPUTE);

    const topPools = pools
      .map((p) => ({
        ...p,
        healthScore: computeHealthScore({
          tvlUsd: p.tvlUsd,
          volume24hUsd: p.volume24hUsd,
          aprTotal: p.aprTotal,
          metadata: p.metadata,
        }),
      }))
      .sort((a, b) => b.aprTotal - a.aprTotal)
      .slice(0, 200)
      .map((p) => ({
        poolId: p.poolId,
        aprTotal: p.aprTotal,
        tvlUsd: p.tvlUsd,
        chain: p.chain,
        protocolId: p.protocolId,
        healthScore: p.healthScore,
      }));

    const job: StrategyComputeJob = {
      type: "optimize",
      poolData: topPools,
      timestamp: new Date().toISOString(),
    };

    await strategyQueue.add("pool-data-updated", job);
    logger.info("Published pool-data-updated event to strategy queue");

    // 5. 记录 PnL 快照（实时净值曲线用）
    try {
      const pnlResult = await query(
        `SELECT COALESCE(SUM(p.value_usd), 0) as total_value,
                COALESCE(SUM(p.unrealized_pnl_usd), 0) as total_pnl,
                COUNT(*) as positions_count
         FROM positions p WHERE p.status = 'active'`
      );
      const pnl = pnlResult.rows[0];
      await query(
        `INSERT INTO position_pnl_snapshots (time, total_value_usd, total_pnl_usd, positions_count)
         VALUES (NOW(), $1, $2, $3)`,
        [pnl.total_value, pnl.total_pnl, pnl.positions_count]
      );
    } catch (pnlErr) {
      logger.warn("PnL 快照写入失败", { error: (pnlErr as Error).message });
    }

    // 6. Log audit event
    await query(
      `INSERT INTO audit_log (event_type, severity, source, message, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        "pool_scan_complete",
        "info",
        "scanner",
        `Scanned ${pools.length} pools, upserted ${upserted}`,
        JSON.stringify({
          duration_ms: Date.now() - startTime,
          pools_fetched: pools.length,
          pools_upserted: upserted,
        }),
      ]
    );
  } catch (err) {
    logger.error("Pool scan failed", { error: (err as Error).message });

    await query(
      `INSERT INTO audit_log (event_type, severity, source, message, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        "pool_scan_failed",
        "error",
        "scanner",
        (err as Error).message,
        JSON.stringify({ duration_ms: Date.now() - startTime }),
      ]
    ).catch(() => {});

    throw err;
  }
}
