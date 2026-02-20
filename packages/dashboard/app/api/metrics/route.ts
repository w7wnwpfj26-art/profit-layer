import { NextResponse } from "next/server";
import { getPool } from "../../lib/db";

const pool = getPool();

export async function GET() {
  try {
    // 业务指标
    const businessMetrics = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM pools WHERE tvl_usd > 0) as active_pools,
        (SELECT COUNT(*) FROM positions WHERE status = 'active') as active_positions,
        (SELECT COALESCE(SUM(value_usd), 0) FROM positions WHERE status = 'active') as total_position_value,
        (SELECT COALESCE(SUM(unrealized_pnl_usd), 0) FROM positions WHERE status = 'active') as total_unrealized_pnl,
        (SELECT COUNT(*) FROM transactions WHERE created_at > NOW() - INTERVAL '24 hours') as tx_24h,
        (SELECT COALESCE(SUM(amount_usd), 0) FROM transactions WHERE tx_type = 'enter' AND created_at > NOW() - INTERVAL '24 hours') as inflow_24h,
        (SELECT COALESCE(SUM(amount_usd), 0) FROM transactions WHERE tx_type = 'exit' AND created_at > NOW() - INTERVAL '24 hours') as outflow_24h
    `);

    // 告警指标
    const alertMetrics = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'triggered') as active_alerts,
        COUNT(*) FILTER (WHERE severity = 'critical' AND status != 'resolved') as critical_alerts,
        COUNT(*) FILTER (WHERE triggered_at > NOW() - INTERVAL '1 hour') as alerts_1h
      FROM alert_events
      WHERE triggered_at > NOW() - INTERVAL '24 hours'
    `);

    // 异常指标
    const anomalyMetrics = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'detected') as active_anomalies,
        COUNT(*) FILTER (WHERE detected_at > NOW() - INTERVAL '1 hour') as anomalies_1h
      FROM anomaly_events
      WHERE detected_at > NOW() - INTERVAL '24 hours'
    `);

    // 数据源健康
    const sourceHealth = await pool.query(`
      SELECT source_id, name, health_status, error_count, last_check_at
      FROM data_sources WHERE enabled = true
      ORDER BY health_status DESC, error_count DESC
    `);

    // 系统指标 (模拟 - 实际需要接入 Prometheus/Grafana)
    const systemMetrics = {
      uptime_hours: Math.floor((Date.now() - new Date("2026-02-07").getTime()) / 3600000),
      memory_usage_pct: Math.round(40 + Math.random() * 20),
      cpu_usage_pct: Math.round(10 + Math.random() * 30),
      db_connections: Math.round(5 + Math.random() * 10),
      api_latency_ms: Math.round(50 + Math.random() * 100),
      scanner_last_run: new Date().toISOString(),
    };

    // 最近活动
    const recentActivity = await pool.query(`
      (SELECT 'transaction' as type, tx_type as action, amount_usd as value, created_at as time
       FROM transactions ORDER BY created_at DESC LIMIT 5)
      UNION ALL
      (SELECT 'alert' as type, rule_id as action, 0 as value, triggered_at as time
       FROM alert_events ORDER BY triggered_at DESC LIMIT 3)
      ORDER BY time DESC LIMIT 10
    `);

    return NextResponse.json({
      business: businessMetrics.rows[0],
      alerts: alertMetrics.rows[0],
      anomalies: anomalyMetrics.rows[0],
      sources: sourceHealth.rows,
      system: systemMetrics,
      recentActivity: recentActivity.rows,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Metrics API error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
