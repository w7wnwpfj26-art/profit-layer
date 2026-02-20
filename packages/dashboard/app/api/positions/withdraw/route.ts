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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { positionId, chain, protocol } = body;

    if (!positionId) {
      return NextResponse.json({ error: "缺少 positionId" }, { status: 400 });
    }

    const pool = getPool();

    // 从 DB 获取持仓详情（pool_id, protocol_id, value_usd）
    const posRes = await pool.query(
      `SELECT p.pool_id, p.value_usd, pl.protocol_id
       FROM positions p
       LEFT JOIN pools pl ON p.pool_id = pl.pool_id
       WHERE p.position_id = $1 AND p.status = 'active'`,
      [positionId]
    );

    if (posRes.rows.length === 0) {
      return NextResponse.json({ error: "持仓不存在或已关闭", positionId }, { status: 404 });
    }

    const row = posRes.rows[0];
    const poolId = row.pool_id;
    const protocolId = row.protocol_id || protocol || "";
    const chainId = chain || "arbitrum";

    if (!protocolId) {
      return NextResponse.json({ error: "无法确定协议，请传入 protocol 参数" }, { status: 400 });
    }

    const redis = getRedis();
    try {
      const signalId = `withdraw-${positionId}-${Date.now()}`;
      const signalData = {
        signalId,
        action: "exit",
        poolId,
        chain: chainId,
        protocolId,
        amountUsd: parseFloat(row.value_usd) || 0,
        params: {},
        timestamp: new Date().toISOString(),
      };
      await redis.xadd(EXECUTE_TX_STREAM, "*", "data", JSON.stringify(signalData));
    } finally {
      redis.disconnect();
    }

    return NextResponse.json({
      success: true,
      message: "撤销信号已入队，Executor 将依次执行（请确保 Executor 服务正在运行）",
      positionId,
      poolId,
    });
  } catch (err) {
    console.error("Withdraw API error:", err);
    return NextResponse.json(
      { error: "Internal Server Error", message: (err as Error).message },
      { status: 500 }
    );
  }
}
