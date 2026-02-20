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
    // 1. 检查 system_config 中的钱包地址
    console.log("=== System Config Wallet ===");
    const config = await pool.query("SELECT key, value FROM system_config WHERE key LIKE '%wallet%'");
    console.log(config.rows);

    // 2. 检查持仓
    console.log("\n=== Active Positions ===");
    const positions = await pool.query(`
      SELECT p.position_id, p.pool_id, pl.symbol, pl.protocol_id, p.value_usd, p.unrealized_pnl_usd, p.wallet_address
      FROM positions p
      LEFT JOIN pools pl ON p.pool_id = pl.pool_id
      WHERE p.status = 'active'
    `);
    console.log(positions.rows);

    // 3. 计算总持仓价值
    const totalPositionValue = positions.rows.reduce((sum, p) => sum + Number(p.value_usd || 0), 0);
    console.log(`\nTotal Position Value: $${totalPositionValue.toFixed(2)}`);

    // 4. 获取钱包地址（从 positions 或 system_config）
    const walletAddress = positions.rows[0]?.wallet_address || config.rows.find(r => r.key === 'evm_wallet_address')?.value;
    console.log(`\nWallet Address: ${walletAddress}`);

    // 5. 如果有钱包地址，测试 balance API
    if (walletAddress) {
      console.log("\n=== Testing Balance Calculation ===");
      // 模拟 balance API 的逻辑
      const chains = ["ethereum", "arbitrum", "bsc", "polygon", "base", "optimism"];
      for (const chain of chains) {
        console.log(`\nChecking ${chain}...`);
        // 这里只是显示逻辑，不实际调用 RPC
      }
    }

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await pool.end();
  }
}

main();
