import { NextResponse } from "next/server";
import { getPool } from "../../lib/db";

const pool = getPool();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate") || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = searchParams.get("endDate") || new Date().toISOString();

    // 获取统计数据
    const [overview, positions, transactions, alerts, performance] = await Promise.all([
      // 概览
      pool.query(`
        SELECT 
          COUNT(DISTINCT pool_id) as total_pools,
          ROUND(SUM(tvl_usd)::numeric, 0) as total_tvl,
          ROUND(AVG(apr_total)::numeric, 2) as avg_apr
        FROM pools WHERE tvl_usd > 0
      `),
      // 持仓统计
      pool.query(`
        SELECT 
          COUNT(*) as total_positions,
          ROUND(SUM(value_usd)::numeric, 2) as total_value,
          ROUND(SUM(realized_pnl_usd)::numeric, 2) as realized_pnl,
          ROUND(SUM(unrealized_pnl_usd)::numeric, 2) as unrealized_pnl
        FROM positions
      `),
      // 交易统计
      pool.query(`
        SELECT 
          COUNT(*) as total_tx,
          ROUND(SUM(amount_usd)::numeric, 2) as total_volume,
          ROUND(SUM(gas_cost_usd)::numeric, 2) as total_gas,
          tx_type,
          COUNT(*) as type_count
        FROM transactions
        WHERE created_at BETWEEN $1 AND $2
        GROUP BY tx_type
        ORDER BY type_count DESC
      `, [startDate, endDate]),
      // 告警统计
      pool.query(`
        SELECT 
          COUNT(*) as total_alerts,
          COUNT(*) FILTER (WHERE severity = 'critical') as critical,
          COUNT(*) FILTER (WHERE severity = 'warning') as warning,
          COUNT(*) FILTER (WHERE status = 'resolved') as resolved
        FROM alert_events
        WHERE triggered_at BETWEEN $1 AND $2
      `, [startDate, endDate]),
      // 收益表现
      pool.query(`
        SELECT 
          DATE(opened_at) as date,
          COUNT(*) as positions_opened,
          ROUND(SUM(value_usd)::numeric, 2) as value
        FROM positions
        WHERE opened_at BETWEEN $1 AND $2
        GROUP BY DATE(opened_at)
        ORDER BY date
      `, [startDate, endDate]),
    ]);

    // 近期交易列表
    const recentTx = await pool.query(`
      SELECT tx_hash, chain_id, tx_type, amount_usd, gas_cost_usd, status, created_at
      FROM transactions
      WHERE created_at BETWEEN $1 AND $2
      ORDER BY created_at DESC
      LIMIT 20
    `, [startDate, endDate]);

    // 持仓详情
    const positionDetails = await pool.query(`
      SELECT 
        p.position_id, p.chain_id, p.value_usd, p.unrealized_pnl_usd, p.status, p.opened_at,
        pl.symbol, pl.protocol_id
      FROM positions p
      LEFT JOIN pools pl ON p.pool_id = pl.pool_id
      WHERE p.status = 'active'
      ORDER BY p.value_usd DESC
      LIMIT 10
    `);

    const defaultOverview = { total_pools: 0, total_tvl: 0, avg_apr: 0 };
    const defaultPositions = { total_positions: 0, total_value: 0, realized_pnl: 0, unrealized_pnl: 0 };
    const defaultAlerts = { total_alerts: 0, critical: 0, warning: 0, resolved: 0 };

    return NextResponse.json({
      reportPeriod: {
        startDate,
        endDate,
        generatedAt: new Date().toISOString(),
      },
      overview: overview.rows[0] ?? defaultOverview,
      positions: positions.rows[0] ?? defaultPositions,
      transactionsByType: transactions.rows ?? [],
      alerts: alerts.rows[0] ?? defaultAlerts,
      dailyPerformance: performance.rows ?? [],
      recentTransactions: recentTx.rows ?? [],
      topPositions: positionDetails.rows ?? [],
    });
  } catch (error) {
    console.error("Report API error:", error);
    return NextResponse.json({ error: "生成报告失败" }, { status: 500 });
  }
}
