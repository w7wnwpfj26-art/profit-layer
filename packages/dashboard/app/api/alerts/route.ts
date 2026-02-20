import { NextResponse } from "next/server";
import { getPool } from "../../lib/db";

const pool = getPool();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    // 趋势数据接口
    if (action === "trend") {
      const hours = parseInt(searchParams.get("hours") || "24");
      const trendResult = await pool.query(
        `
        SELECT
          DATE_TRUNC('hour', triggered_at) as hour,
          severity,
          COUNT(*) as count
        FROM alert_events
        WHERE triggered_at > NOW() - INTERVAL '${hours} hours'
        GROUP BY hour, severity
        ORDER BY hour DESC
        `,
        []
      );
      return NextResponse.json({ trend: trendResult.rows });
    }

    // 分布统计接口
    if (action === "distribution") {
      const distResult = await pool.query(`
        SELECT
          severity,
          status,
          COUNT(*) as count
        FROM alert_events
        WHERE triggered_at > NOW() - INTERVAL '24 hours'
        GROUP BY severity, status
      `);
      return NextResponse.json({ distribution: distResult.rows });
    }

    // 主列表查询
    const status = searchParams.get("status");
    const severity = searchParams.get("severity");
    const search = searchParams.get("search");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = `
      SELECT e.*, r.name as rule_name
      FROM alert_events e
      LEFT JOIN alert_rules r ON e.rule_id = r.rule_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (status && status !== "all") {
      params.push(status);
      query += ` AND e.status = $${params.length}`;
    }
    if (severity) {
      params.push(severity);
      query += ` AND e.severity = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (e.message ILIKE $${params.length} OR r.name ILIKE $${params.length})`;
    }
    if (startDate) {
      params.push(startDate);
      query += ` AND e.triggered_at >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      query += ` AND e.triggered_at <= $${params.length}`;
    }

    // 总数查询
    const countQuery = query.replace("SELECT e.*, r.name as rule_name", "SELECT COUNT(*) as total");
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.total || "0");

    // 分页查询
    params.push(limit);
    query += ` ORDER BY e.triggered_at DESC LIMIT $${params.length}`;
    params.push(offset);
    query += ` OFFSET $${params.length}`;

    const result = await pool.query(query, params);

    // 统计
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'triggered') as triggered,
        COUNT(*) FILTER (WHERE status = 'acknowledged') as acknowledged,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
        COUNT(*) FILTER (WHERE severity = 'critical' AND status != 'resolved') as critical
      FROM alert_events
      WHERE triggered_at > NOW() - INTERVAL '24 hours'
    `);

    return NextResponse.json({
      alerts: result.rows,
      stats: statsResult.rows[0],
      total,
      limit,
      offset,
    });
  } catch (err) {
    console.error("Alerts API error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, eventId, eventIds, userId } = body;

    // 单个操作
    if (action === "acknowledge" && eventId) {
      await pool.query(
        `UPDATE alert_events SET status = 'acknowledged', acknowledged_at = NOW(), acknowledged_by = $2 WHERE event_id = $1`,
        [eventId, userId || "system"]
      );
      return NextResponse.json({ success: true, message: "告警已确认" });
    }

    if (action === "resolve" && eventId) {
      await pool.query(
        `UPDATE alert_events SET status = 'resolved', resolved_at = NOW() WHERE event_id = $1`,
        [eventId]
      );
      return NextResponse.json({ success: true, message: "告警已解决" });
    }

    // 批量操作
    if (action === "batchAcknowledge" && eventIds && Array.isArray(eventIds)) {
      await pool.query(
        `UPDATE alert_events SET status = 'acknowledged', acknowledged_at = NOW(), acknowledged_by = $1 WHERE event_id = ANY($2)`,
        [userId || "system", eventIds]
      );
      return NextResponse.json({ success: true, message: `已确认 ${eventIds.length} 条告警` });
    }

    if (action === "batchResolve" && eventIds && Array.isArray(eventIds)) {
      await pool.query(
        `UPDATE alert_events SET status = 'resolved', resolved_at = NOW() WHERE event_id = ANY($1)`,
        [eventIds]
      );
      return NextResponse.json({ success: true, message: `已解决 ${eventIds.length} 条告警` });
    }

    if (action === "batchDelete" && eventIds && Array.isArray(eventIds)) {
      await pool.query(`DELETE FROM alert_events WHERE event_id = ANY($1)`, [eventIds]);
      return NextResponse.json({ success: true, message: `已删除 ${eventIds.length} 条告警` });
    }

    return NextResponse.json({ error: "无效操作" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
