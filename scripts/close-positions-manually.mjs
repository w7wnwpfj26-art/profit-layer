#!/usr/bin/env node
import pg from "pg";

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432"),
  database: process.env.POSTGRES_DB || "defi_yield",
  user: process.env.POSTGRES_USER || "defi",
  password: process.env.POSTGRES_PASSWORD || "change_me_in_production",
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function main() {
  try {
    const walletAddress = "0x41f74b75de939692191f87c3e671052eaa956677";

    console.log("=== 手动关闭持仓 ===\n");

    // 查询当前活跃持仓
    const result = await pool.query(`
      SELECT p.position_id, p.pool_id, p.value_usd, p.chain_id, pl.protocol_id
      FROM positions p
      LEFT JOIN pools pl ON p.pool_id = pl.pool_id
      WHERE p.wallet_address = $1 AND p.status = 'active'
    `, [walletAddress]);

    if (result.rows.length === 0) {
      console.log("没有找到活跃持仓");
      return;
    }

    console.log(`找到 ${result.rows.length} 个活跃持仓:\n`);
    result.rows.forEach(row => {
      console.log(`  ${row.position_id}`);
      console.log(`    Pool: ${row.pool_id}`);
      console.log(`    Protocol: ${row.protocol_id}`);
      console.log(`    Chain: ${row.chain_id}`);
      console.log(`    Value: $${row.value_usd}\n`);
    });

    // 标记为已关闭
    const updateResult = await pool.query(`
      UPDATE positions
      SET status = 'closed',
          closed_at = NOW(),
          updated_at = NOW()
      WHERE wallet_address = $1 AND status = 'active'
      RETURNING position_id
    `, [walletAddress]);

    console.log(`✓ 已关闭 ${updateResult.rows.length} 个持仓\n`);

    // 记录审计日志
    await pool.query(`
      INSERT INTO audit_log (event_type, severity, source, message, metadata)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      'manual_close_positions',
      'info',
      'manual_script',
      `手动关闭 ${updateResult.rows.length} 个持仓`,
      JSON.stringify({
        wallet_address: walletAddress,
        count: updateResult.rows.length,
        position_ids: updateResult.rows.map(r => r.position_id)
      })
    ]);

    console.log("✓ 已记录审计日志");

  } catch (err) {
    console.error("错误:", err.message);
    console.error(err.stack);
  } finally {
    await pool.end();
  }
}

main();
