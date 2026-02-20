import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";

const pool = getPool();

// GET: 获取单个策略的详细配置
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const strategyId = searchParams.get("id");

  if (!strategyId) {
    return NextResponse.json({ error: "缺少 id 参数" }, { status: 400 });
  }

  try {
    const result = await pool.query(
      `SELECT strategy_id, name, strategy_type, description, config, is_active,
              total_allocated_usd, total_pnl_usd, created_at, updated_at
       FROM strategies WHERE strategy_id = $1`,
      [strategyId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "策略不存在" }, { status: 404 });
    }

    const r = result.rows[0];

    // 获取该策略关联的持仓数量和价值
    const posResult = await pool.query(
      `SELECT COUNT(*) as position_count,
              COALESCE(SUM(value_usd), 0) as positions_value,
              COALESCE(SUM(unrealized_pnl_usd), 0) as unrealized_pnl,
              COALESCE(SUM(realized_pnl_usd), 0) as realized_pnl
       FROM positions WHERE strategy_id = $1 AND status = 'active'`,
      [strategyId]
    );

    const pos = posResult.rows[0];

    return NextResponse.json({
      success: true,
      strategy: {
        strategyId: r.strategy_id,
        name: r.name,
        type: r.strategy_type,
        description: r.description,
        config: r.config || {},
        isActive: r.is_active,
        totalAllocatedUsd: Number(r.total_allocated_usd),
        totalPnlUsd: Number(r.total_pnl_usd),
        positionCount: Number(pos.position_count),
        positionsValue: Number(pos.positions_value),
        unrealizedPnl: Number(pos.unrealized_pnl),
        realizedPnl: Number(pos.realized_pnl),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      },
    });
  } catch (err) {
    console.error("Strategy config GET error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// PUT: 更新策略配置
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { strategyId, config } = body;

    if (!strategyId || !config || typeof config !== "object") {
      return NextResponse.json({ error: "缺少 strategyId 或 config" }, { status: 400 });
    }

    // 合并现有 config
    const existing = await pool.query(
      `SELECT config FROM strategies WHERE strategy_id = $1`,
      [strategyId]
    );

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "策略不存在" }, { status: 404 });
    }

    const mergedConfig = { ...(existing.rows[0].config || {}), ...config };

    await pool.query(
      `UPDATE strategies SET config = $1, updated_at = NOW() WHERE strategy_id = $2`,
      [JSON.stringify(mergedConfig), strategyId]
    );

    // 审计日志
    await pool.query(
      `INSERT INTO audit_log (event_type, severity, source, message, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        "strategy_config_updated",
        "info",
        "dashboard",
        `策略 ${strategyId} 配置已更新`,
        JSON.stringify({ strategyId, config: mergedConfig }),
      ]
    );

    return NextResponse.json({ success: true, config: mergedConfig });
  } catch (err) {
    console.error("Strategy config PUT error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
