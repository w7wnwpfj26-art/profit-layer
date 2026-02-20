import { NextResponse } from "next/server";
import { getPool } from "../../lib/db";

const pool = getPool();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);
    const severity = searchParams.get("severity"); // info, warning, error, critical
    const source = searchParams.get("source");     // scanner, dashboard, risk_monitor, executor, telegram_bot, ai
    const search = searchParams.get("search");

    let where = "WHERE 1=1";
    const params: any[] = [];
    let idx = 1;

    if (severity && severity !== "all") {
      where += ` AND severity = $${idx}`;
      params.push(severity);
      idx++;
    }

    if (source && source !== "all") {
      where += ` AND source = $${idx}`;
      params.push(source);
      idx++;
    }

    if (search) {
      where += ` AND (LOWER(message) LIKE $${idx} OR LOWER(event_type) LIKE $${idx})`;
      params.push(`%${search.toLowerCase()}%`);
      idx++;
    }

    // 日志列表
    const logsResult = await pool.query(
      `SELECT id, event_type, severity, source, message, metadata, created_at
       FROM audit_log ${where}
       ORDER BY created_at DESC
       LIMIT $${idx}`,
      [...params, limit]
    );

    // 统计概览
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE severity = 'info') as info_count,
        COUNT(*) FILTER (WHERE severity = 'warning') as warning_count,
        COUNT(*) FILTER (WHERE severity = 'error') as error_count,
        COUNT(*) FILTER (WHERE severity = 'critical') as critical_count,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as last_hour,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h
      FROM audit_log
    `);

    // 来源分布
    const sourcesResult = await pool.query(`
      SELECT source, COUNT(*) as count 
      FROM audit_log 
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY source ORDER BY count DESC
    `);

    // 系统健康检查
    const healthChecks = await Promise.all([
      pool.query(`SELECT MAX(last_scanned_at) as t FROM pools WHERE is_active = true`),
      pool.query(`SELECT COUNT(*) as c FROM pools WHERE is_active = true AND tvl_usd > 100000`),
      pool.query(`SELECT COUNT(*) as c FROM positions WHERE status = 'active'`),
      pool.query(`SELECT key, value FROM system_config WHERE key IN ('autopilot_enabled','autopilot_dry_run','kill_switch')`),
    ]);

    const lastScan = healthChecks[0].rows[0]?.t;
    const scanAgeSec = lastScan ? Math.floor((Date.now() - new Date(lastScan).getTime()) / 1000) : 9999;
    
    const cfgMap: Record<string, string> = {};
    healthChecks[3].rows.forEach((r: any) => cfgMap[r.key] = r.value);

    const s = statsResult.rows[0];

    return NextResponse.json({
      logs: logsResult.rows.map((r: any) => ({
        id: r.id,
        eventType: r.event_type,
        severity: r.severity,
        source: r.source,
        message: r.message,
        metadata: r.metadata,
        createdAt: r.created_at,
      })),
      stats: {
        total: Number(s.total),
        info: Number(s.info_count),
        warning: Number(s.warning_count),
        error: Number(s.error_count),
        critical: Number(s.critical_count),
        lastHour: Number(s.last_hour),
        last24h: Number(s.last_24h),
      },
      sources: sourcesResult.rows.map((r: any) => ({ source: r.source, count: Number(r.count) })),
      health: {
        scannerAlive: scanAgeSec < 600,
        scanAgeSec,
        poolCount: Number(healthChecks[1].rows[0]?.c || 0),
        activePositions: Number(healthChecks[2].rows[0]?.c || 0),
        autopilotEnabled: cfgMap.autopilot_enabled === "true",
        dryRun: cfgMap.autopilot_dry_run === "true",
        killSwitch: cfgMap.kill_switch === "true",
      },
    });
  } catch (err) {
    console.error("Logs API error:", err);
    return NextResponse.json({ error: (err as Error).message, logs: [] }, { status: 500 });
  }
}
