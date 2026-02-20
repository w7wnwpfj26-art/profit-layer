// 清空测试/假数据（交易 + 持仓）
// 运行: pnpm run clear-test-data  或  npx tsx scripts/clear-test-data.ts
// 需设置数据库环境变量，或复制 .env.example 为 .env 后执行

import pg from "pg";

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5433"),
  database: process.env.POSTGRES_DB || "defi_yield",
  user: process.env.POSTGRES_USER || "defi",
  password: process.env.POSTGRES_PASSWORD || "change_me_in_production",
});

async function main() {
  const client = await pool.connect();
  try {
    const [trBefore, prBefore] = await Promise.all([
      client.query("SELECT COUNT(*) AS c FROM transactions"),
      client.query("SELECT COUNT(*) AS c FROM positions"),
    ]);
    await client.query("DELETE FROM transactions");
    await client.query("DELETE FROM positions");
    console.log("已清空: transactions, positions");
    console.log("已删除 transactions:", trBefore.rows[0]?.c ?? 0, "条");
    console.log("已删除 positions:", prBefore.rows[0]?.c ?? 0, "条");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
