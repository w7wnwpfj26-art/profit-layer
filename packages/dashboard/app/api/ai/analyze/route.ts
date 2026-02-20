import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";

const pool = getPool();
const AI_ENGINE_URL = process.env.AI_ENGINE_URL || "http://localhost:8000";

export async function GET() {
  try {
    // 1. 从数据库收集市场快照
    const [statsResult, topPoolsResult, positionsResult] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) as total_pools,
               ROUND(AVG(apr_total)::numeric, 2) as avg_apr,
               ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY apr_total)::numeric, 2) as median_apr,
               ROUND(SUM(tvl_usd)::numeric, 0) as total_tvl
        FROM pools WHERE is_active = true AND tvl_usd > 100000
      `),
      pool.query(`
        SELECT pool_id, protocol_id, chain_id, symbol, apr_total, tvl_usd,
               volume_24h_usd, health_score
        FROM pools WHERE is_active = true AND tvl_usd > 500000 AND apr_total < 500
        ORDER BY health_score DESC NULLS LAST, apr_total DESC
        LIMIT 20
      `),
      pool.query(`
        SELECT p.position_id, p.pool_id, p.chain_id, p.value_usd,
               p.unrealized_pnl_usd, pl.symbol, pl.protocol_id, pl.apr_total
        FROM positions p
        LEFT JOIN pools pl ON p.pool_id = pl.pool_id
        WHERE p.status = 'active'
      `),
    ]);

    const s = statsResult.rows[0];
    const portfolioValue = positionsResult.rows.reduce((sum: number, r: any) => sum + Number(r.value_usd || 0), 0);
    const portfolioPnl = positionsResult.rows.reduce((sum: number, r: any) => sum + Number(r.unrealized_pnl_usd || 0), 0);

    const marketContext = {
      total_pools: Number(s.total_pools),
      avg_apr: Number(s.avg_apr),
      median_apr: Number(s.median_apr),
      total_tvl_usd: Number(s.total_tvl),
      top_pools: topPoolsResult.rows.map((r: any) => ({
        poolId: r.pool_id,
        protocolId: r.protocol_id,
        chain: r.chain_id,
        symbol: r.symbol,
        aprTotal: Number(r.apr_total),
        tvlUsd: Number(r.tvl_usd),
        volume24hUsd: Number(r.volume_24h_usd),
        healthScore: r.health_score != null ? Number(r.health_score) : null,
      })),
      active_positions: positionsResult.rows.map((r: any) => ({
        positionId: r.position_id,
        poolId: r.pool_id,
        symbol: r.symbol || r.pool_id,
        chain: r.chain_id,
        valueUsd: Number(r.value_usd),
        unrealizedPnlUsd: Number(r.unrealized_pnl_usd),
        apr: Number(r.apr_total || 0),
      })),
      portfolio_value_usd: portfolioValue,
      portfolio_pnl_usd: portfolioPnl,
    };

    // 2. 转发到 AI Engine
    const aiRes = await fetch(`${AI_ENGINE_URL}/ai/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(marketContext),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return NextResponse.json({ error: `AI 引擎返回错误: ${errText}` }, { status: 502 });
    }

    const advice = await aiRes.json();
    return NextResponse.json(advice);
  } catch (err) {
    console.error("AI analyze error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
