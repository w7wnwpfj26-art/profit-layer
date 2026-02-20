import { NextResponse } from "next/server";
import { getPool } from "../../lib/db";

const pool = getPool();

export async function GET() {
  try {
    // 业务指标
    const [poolStats, positionStats, alertStats, txStats] = await Promise.all([
      // 池子统计
      pool.query(`
        SELECT 
          COUNT(*) as total_pools,
          ROUND(SUM(tvl_usd)::numeric, 0) as total_tvl,
          ROUND(AVG(apr_total)::numeric, 2) as avg_apr,
          COUNT(*) FILTER (WHERE health_score < 30) as low_health_pools
        FROM pools WHERE tvl_usd > 0
      `),
      // 持仓统计
      pool.query(`
        SELECT 
          COUNT(*) as active_positions,
          ROUND(SUM(value_usd)::numeric, 2) as total_value,
          ROUND(SUM(unrealized_pnl_usd)::numeric, 2) as total_pnl
        FROM positions WHERE status = 'active'
      `),
      // 告警统计
      pool.query(`
        SELECT 
          COUNT(*) as total_alerts,
          COUNT(*) FILTER (WHERE status = 'triggered') as triggered,
          COUNT(*) FILTER (WHERE severity = 'critical') as critical
        FROM alert_events WHERE triggered_at > NOW() - INTERVAL '24 hours'
      `),
      // 交易统计
      pool.query(`
        SELECT 
          COUNT(*) as total_tx,
          ROUND(SUM(amount_usd)::numeric, 2) as total_volume,
          ROUND(SUM(gas_cost_usd)::numeric, 2) as total_gas
        FROM transactions WHERE created_at > NOW() - INTERVAL '24 hours'
      `),
    ]);

    // 系统指标（模拟，实际需要接入监控系统）
    const systemMetrics = {
      scanner: {
        status: "healthy",
        lastRun: new Date().toISOString(),
        avgLatency: Math.floor(Math.random() * 100 + 50),
        errorRate: Math.random() * 0.5,
      },
      executor: {
        status: "healthy",
        pendingTx: 0,
        avgGas: 0.05,
        successRate: 99.5,
      },
      database: {
        status: "healthy",
        connections: Math.floor(Math.random() * 10 + 2),
        queryLatency: Math.floor(Math.random() * 20 + 5),
        diskUsage: 45,
      },
      api: {
        status: "healthy",
        requestsPerMin: Math.floor(Math.random() * 50 + 10),
        avgResponseTime: Math.floor(Math.random() * 50 + 20),
        errorRate: 0,
      },
    };

    // 数据源状态
    const dataSources = [
      { name: "DefiLlama", status: "online", latency: 120, lastSync: new Date(Date.now() - 60000).toISOString() },
      { name: "CoinGecko", status: "online", latency: 85, lastSync: new Date(Date.now() - 30000).toISOString() },
      { name: "Arbitrum RPC", status: "online", latency: 45, lastSync: new Date().toISOString() },
      { name: "Base RPC", status: "online", latency: 52, lastSync: new Date().toISOString() },
    ];

    return NextResponse.json({
      business: {
        pools: poolStats.rows[0],
        positions: positionStats.rows[0],
        alerts: alertStats.rows[0],
        transactions: txStats.rows[0],
      },
      system: systemMetrics,
      dataSources,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Ops metrics error:", error);
    return NextResponse.json({ error: "获取运维指标失败" }, { status: 500 });
  }
}
