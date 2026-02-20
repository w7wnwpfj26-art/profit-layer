import { NextResponse } from "next/server";
import { getPool } from "../../lib/db";

const pool = getPool();

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT s.strategy_id, s.name, s.strategy_type, s.is_active, 
             s.total_allocated_usd, s.total_pnl_usd, s.config,
             COALESCE(p.pos_count, 0) AS positions_count,
             COALESCE(p.allocated, 0) AS live_allocated
      FROM strategies s
      LEFT JOIN (
        SELECT strategy_id, COUNT(*) AS pos_count, SUM(value_usd) AS allocated
        FROM positions WHERE status = 'active' GROUP BY strategy_id
      ) p ON s.strategy_id = p.strategy_id
      ORDER BY s.is_active DESC, s.total_allocated_usd DESC
    `);

    const strategies = result.rows.map((r) => ({
      strategyId: r.strategy_id,
      name: r.name,
      type: r.strategy_type,
      isActive: r.is_active,
      totalAllocatedUsd: Number(r.total_allocated_usd),
      totalPnlUsd: Number(r.total_pnl_usd),
      config: r.config || {},
      positionsCount: Number(r.positions_count),
      liveAllocatedUsd: Number(r.live_allocated),
    }));

    // 读取 AutoPilot 状态
    let autoPilotStatus = "disabled";
    const cfgResult = await pool.query(
      `SELECT key, value FROM system_config WHERE key IN ('autopilot_enabled', 'autopilot_dry_run')`
    );
    const cfgMap: Record<string, string> = {};
    for (const r of cfgResult.rows) cfgMap[r.key] = r.value;

    const enabled = cfgMap["autopilot_enabled"] === "true";
    const dryRun = cfgMap["autopilot_dry_run"] !== "false";
    if (enabled) {
      autoPilotStatus = dryRun ? "dry_run" : "running";
    }

    return NextResponse.json({ strategies, autoPilotStatus });
  } catch (err) {
    console.error("Strategies GET error:", err);
    return NextResponse.json(
      { error: "数据库查询失败", strategies: [], autoPilotStatus: "disabled" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { strategyId, isActive } = body;

    if (!strategyId || typeof isActive !== "boolean") {
      return NextResponse.json({ error: "缺少 strategyId 或 isActive" }, { status: 400 });
    }

    const result = await pool.query(
      `UPDATE strategies SET is_active = $1, updated_at = NOW() WHERE strategy_id = $2`,
      [isActive, strategyId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: `策略 ${strategyId} 不存在` }, { status: 404 });
    }

    // 记录审计日志
    await pool.query(
      `INSERT INTO audit_log (event_type, severity, source, message, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        isActive ? "strategy_enabled" : "strategy_disabled",
        "info",
        "dashboard",
        `策略 ${strategyId} 已${isActive ? "启用" : "停用"}`,
        JSON.stringify({ strategyId, isActive }),
      ]
    );

    return NextResponse.json({ success: true, strategyId, isActive });
  } catch (err) {
    console.error("[API] error:", (err as Error).message);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { strategyId, config } = body;

    if (!strategyId || config === undefined) {
      return NextResponse.json({ error: "缺少 strategyId 或 config" }, { status: 400 });
    }

    // 获取旧配置用于审计日志
    const oldResult = await pool.query(
      `SELECT config FROM strategies WHERE strategy_id = $1`,
      [strategyId]
    );

    if (oldResult.rowCount === 0) {
      return NextResponse.json({ error: `策略 ${strategyId} 不存在` }, { status: 404 });
    }

    const oldConfig = oldResult.rows[0].config;

    // 更新配置
    await pool.query(
      `UPDATE strategies SET config = $1, updated_at = NOW() WHERE strategy_id = $2`,
      [JSON.stringify(config), strategyId]
    );

    // 记录审计日志
    await pool.query(
      `INSERT INTO audit_log (event_type, severity, source, message, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        "strategy_config_updated",
        "info",
        "dashboard",
        `策略 ${strategyId} 配置已更新`,
        JSON.stringify({ strategyId, oldConfig, newConfig: config }),
      ]
    );

    return NextResponse.json({ success: true, strategyId, config });
  } catch (err) {
    console.error("[API] error:", (err as Error).message);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
