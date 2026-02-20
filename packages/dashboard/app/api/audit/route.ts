import { NextResponse } from "next/server";
import { getPool } from "../../lib/db";

const pool = getPool();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const walletAddress = searchParams.get("wallet");
    const limit = parseInt(searchParams.get("limit") || "100");

    let query = `SELECT * FROM audit_logs WHERE 1=1`;
    const params: (string | number)[] = [];

    if (action) {
      params.push(action);
      query += ` AND action = $${params.length}`;
    }
    if (walletAddress) {
      params.push(walletAddress);
      query += ` AND wallet_address = $${params.length}`;
    }

    params.push(limit);
    query += ` ORDER BY created_at DESC LIMIT $${params.length}`;

    const result = await pool.query(query, params);

    // 统计各操作类型数量
    const statsResult = await pool.query(`
      SELECT action, COUNT(*) as count
      FROM audit_logs
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY action
      ORDER BY count DESC
    `);

    return NextResponse.json({
      logs: result.rows,
      stats: statsResult.rows,
    });
  } catch (err) {
    console.error("Audit logs API error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// 记录审计日志
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      userId,
      walletAddress,
      action,
      resourceType,
      resourceId,
      beforeState,
      afterState,
      status = "success",
      errorMessage,
    } = body;

    const logId = `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await pool.query(
      `INSERT INTO audit_logs (log_id, user_id, wallet_address, action, resource_type, resource_id, before_state, after_state, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        logId,
        userId || null,
        walletAddress || null,
        action,
        resourceType || null,
        resourceId || null,
        JSON.stringify(beforeState || null),
        JSON.stringify(afterState || null),
        status,
        errorMessage || null,
      ]
    );

    return NextResponse.json({ success: true, logId });
  } catch (err) {
    console.error("Audit log creation failed:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
