import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";
import IORedis from "ioredis";

const EXECUTE_TX_STREAM = "bull:execute-tx:events";

function getRedis() {
  return new IORedis({
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  });
}

// POST: 一键清仓（退出所有活跃持仓）
export async function POST(request: Request) {
  const pool = getPool();
  const redis = getRedis();

  try {
    const body = await request.json().catch(() => ({}));
    const reason = body.reason || "用户手动触发一键清仓";

    // 1. 获取所有活跃持仓
    const posRes = await pool.query(`
      SELECT p.position_id, p.pool_id, p.chain_id, p.value_usd, pl.protocol_id
      FROM positions p
      JOIN pools pl ON p.pool_id = pl.pool_id
      WHERE p.status = 'active'
    `);

    const positions = posRes.rows;

    if (positions.length === 0) {
      return NextResponse.json({ success: true, message: "当前没有活跃持仓", count: 0 });
    }

    // 2. 批量发送 exit 信号
    let signalCount = 0;
    for (const row of positions) {
      const signalId = `panic-${row.position_id}-${Date.now()}`;
      const signalData = {
        signalId,
        action: "exit",
        poolId: row.pool_id,
        chain: row.chain_id,
        protocolId: row.protocol_id,
        amountUsd: parseFloat(row.value_usd) || 0,
        params: { reason },
        timestamp: new Date().toISOString(),
      };
      
      await redis.xadd(EXECUTE_TX_STREAM, "*", "data", JSON.stringify(signalData));
      signalCount++;
    }

    // 3. 禁用 AutoPilot 防止重新买入 (注意：不能开启 Kill Switch，否则 Executor 会拒绝执行退出交易)
    await pool.query(
      `UPDATE system_config SET value = 'false', updated_at = NOW() WHERE key = 'autopilot_enabled'`
    );

    // 4. 记录日志
    try {
      await pool.query(
        `INSERT INTO audit_log (event_type, severity, source, message, metadata)
         VALUES ('panic_sell_all', 'critical', 'dashboard', $1, $2)`,
        [`一键清仓已触发，共 ${signalCount} 个持仓`, JSON.stringify({ count: signalCount, reason })]
      );
    } catch (e) {
      console.warn("Audit log insert failed:", e);
    }

    return NextResponse.json({
      success: true,
      message: `已触发 ${signalCount} 个持仓的退出流程，并开启了紧急停止开关。`,
      count: signalCount,
    });

  } catch (err) {
    console.error("Panic Sell API error:", err);
    return NextResponse.json(
      { error: "清仓请求失败", message: (err as Error).message },
      { status: 500 }
    );
  } finally {
    redis.disconnect();
  }
}
