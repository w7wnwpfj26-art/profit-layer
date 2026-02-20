// ============================================
// 回收所有资金 + 更新配置为仅投 10000+ APY 池子、忽略安全分
// 运行: pnpm --filter @defi-yield/executor exec tsx scripts/recover-and-reinvest.ts
// ============================================

import { getDbPool, getRedisConnection, closeDbPool, loadConfig } from "@defi-yield/common";

const EXECUTE_TX_STREAM = "bull:execute-tx:events";

async function main() {
  loadConfig(); // 确保 .env 已加载
  console.log("=== 回收资金 + 更新投资配置 ===\n");

  const pool = getDbPool();
  const redis = getRedisConnection();

  try {
    await pool.query("SELECT 1");
    await redis.ping();
    console.log("数据库、Redis 连接成功\n");

    // ---- 1. 获取所有活跃持仓并下发 exit 信号 ----
    const posRes = await pool.query(`
      SELECT p.position_id, p.pool_id, p.chain_id, p.value_usd, pl.protocol_id
      FROM positions p
      JOIN pools pl ON p.pool_id = pl.pool_id
      WHERE p.status = 'active'
    `);

    const positions = posRes.rows;
    console.log(`找到 ${positions.length} 个活跃持仓`);

    for (const row of positions) {
      const signalId = `recover-${row.position_id}-${Date.now()}`;
      const signalData = {
        signalId,
        action: "exit",
        poolId: row.pool_id,
        chain: row.chain_id,
        protocolId: row.protocol_id,
        amountUsd: parseFloat(row.value_usd) || 0,
        params: {},
        timestamp: new Date().toISOString(),
      };
      await redis.xadd(EXECUTE_TX_STREAM, "*", "data", JSON.stringify(signalData));
      console.log(`  下发 exit: ${row.protocol_id}/${row.pool_id} (${row.chain_id})`);
    }

    if (positions.length > 0) {
      console.log(`\n已下发 ${positions.length} 个 exit 信号到 Redis，Executor 将依次执行\n`);
    }

    // ---- 2. 更新 system_config：仅投 10000+ APY，忽略安全分 ----
    const upsert = async (key: string, value: string, desc: string) => {
      await pool.query(
        `INSERT INTO system_config (key, value, description, category, updated_at)
         VALUES ($1, $2, $3, 'strategy', NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, value, desc]
      );
    };

    await upsert("min_health_score", "0", "忽略安全分（0=不过滤）");
    await upsert("min_apr_total", "1000", "最低 APR %，仅投 1000+ APY 池子");

    console.log("已更新 system_config:");
    console.log("  min_health_score = 0 (忽略安全分)");
    console.log("  min_apr_total = 1000 (仅投 1000+ APY 池子)\n");

    console.log("完成。请确保 Executor 服务正在运行以执行 exit 交易。");
  } finally {
    await closeDbPool();
    redis.disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
