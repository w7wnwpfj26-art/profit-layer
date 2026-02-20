import { NextResponse } from "next/server";
import { getPool } from "../../lib/db";

const pool = getPool();

export async function GET() {
  try {
    const [stats, chainStats, topProtocols, topPools, freshness] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) AS total_pools,
          COUNT(DISTINCT protocol_id) AS total_protocols,
          COUNT(DISTINCT chain_id) AS total_chains,
          ROUND(SUM(tvl_usd)::numeric, 0) AS total_tvl,
          ROUND(AVG(apr_total)::numeric, 2) AS avg_apr,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY apr_total)::numeric, 2) AS median_apr,
          ROUND(AVG(health_score)::numeric, 1) AS avg_health_score,
          COUNT(*) FILTER (WHERE health_score >= 60) AS healthy_pools_count
        FROM pools WHERE is_active = true AND tvl_usd > 100000
      `),
      pool.query(`
        SELECT chain_id,
          COUNT(*) AS pool_count,
          ROUND(SUM(tvl_usd)::numeric, 0) AS total_tvl,
          ROUND(AVG(apr_total)::numeric, 2) AS avg_apr
        FROM pools WHERE is_active = true AND tvl_usd > 100000
        GROUP BY chain_id ORDER BY SUM(tvl_usd) DESC
      `),
      pool.query(`
        SELECT protocol_id,
          COUNT(*) AS pool_count,
          ROUND(SUM(tvl_usd)::numeric, 0) AS total_tvl
        FROM pools WHERE is_active = true
        GROUP BY protocol_id ORDER BY SUM(tvl_usd) DESC LIMIT 15
      `),
      pool.query(`
        SELECT pool_id, protocol_id, chain_id, symbol, apr_total, tvl_usd, volume_24h_usd, health_score
        FROM pools WHERE is_active = true AND tvl_usd > 1000000 AND apr_total < 500
        ORDER BY apr_total DESC LIMIT 20
      `),
      pool.query(`
        SELECT MAX(last_scanned_at) AS last_updated,
               EXTRACT(EPOCH FROM (NOW() - MAX(last_scanned_at)))::int AS data_age_sec
        FROM pools WHERE is_active = true
      `),
    ]);

    const s = stats.rows[0];
    const f = freshness.rows[0];

    return NextResponse.json({
      lastUpdated: f?.last_updated || null,
      dataAgeSec: Number(f?.data_age_sec) || 0,
      overview: {
        totalPools: Number(s.total_pools),
        totalProtocols: Number(s.total_protocols),
        totalChains: Number(s.total_chains),
        totalTvlUsd: Number(s.total_tvl),
        avgApr: Number(s.avg_apr),
        medianApr: Number(s.median_apr),
        avgHealthScore: s.avg_health_score != null ? Number(s.avg_health_score) : null,
        healthyPoolsCount: s.healthy_pools_count != null ? Number(s.healthy_pools_count) : null,
      },
      chainAllocation: chainStats.rows.map((r) => ({
        chain: r.chain_id,
        poolCount: Number(r.pool_count),
        tvlUsd: Number(r.total_tvl),
        avgApr: Number(r.avg_apr),
      })),
      topProtocols: topProtocols.rows.map((r) => ({
        protocolId: r.protocol_id,
        poolCount: Number(r.pool_count),
        tvlUsd: Number(r.total_tvl),
      })),
      topPools: topPools.rows.map((r) => ({
        poolId: r.pool_id,
        protocolId: r.protocol_id,
        chain: r.chain_id,
        symbol: r.symbol,
        aprTotal: Number(r.apr_total),
        tvlUsd: Number(r.tvl_usd),
        volume24hUsd: Number(r.volume_24h_usd),
        healthScore: r.health_score != null ? Number(r.health_score) : null,
      })),
    });
  } catch (err) {
    console.error("Stats API error:", err);
    return NextResponse.json(
      { error: "数据库连接失败", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
