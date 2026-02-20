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
    // 测试 positions API 的完整查询
    console.log("=== Testing Positions API Query ===\n");

    const query = `
      SELECT p.position_id, p.pool_id, p.wallet_address, p.chain_id,
             p.strategy_id, p.value_usd, p.unrealized_pnl_usd, p.realized_pnl_usd,
             p.amount_token0, p.amount_token1, p.entry_price_token0, p.entry_price_token1,
             p.status, p.opened_at, p.closed_at, p.updated_at,
             pl.symbol, pl.protocol_id, pl.apr_base, pl.apr_reward, pl.apr_total,
             pl.tvl_usd AS pool_tvl, pl.volume_24h_usd, pl.fee_tier, pl.health_score, pl.tokens,
             s.name AS strategy_name,
             pr.name AS protocol_name, pr.category AS protocol_category, pr.website_url, pr.logo_url,
             ch.explorer_url
      FROM positions p
      LEFT JOIN pools pl ON p.pool_id = pl.pool_id
      LEFT JOIN strategies s ON p.strategy_id = s.strategy_id
      LEFT JOIN protocols pr ON pl.protocol_id = pr.protocol_id
      LEFT JOIN chains ch ON p.chain_id = ch.chain_id
      WHERE 1=1
        AND p.status = $1
      ORDER BY p.value_usd DESC
    `;

    const result = await pool.query(query, ['active']);
    console.log(`Found ${result.rows.length} positions\n`);

    if (result.rows.length > 0) {
      console.log("Sample position:");
      console.log(JSON.stringify(result.rows[0], null, 2));
    } else {
      console.log("No positions found. Testing simpler query...\n");

      // 测试简化查询
      const simpleQuery = `
        SELECT p.position_id, p.pool_id, p.value_usd, p.status
        FROM positions p
        WHERE p.status = 'active'
      `;
      const simpleResult = await pool.query(simpleQuery);
      console.log(`Simple query found ${simpleResult.rows.length} positions`);
      if (simpleResult.rows.length > 0) {
        console.log(simpleResult.rows);
      }
    }

  } catch (err) {
    console.error("Error:", err.message);
    console.error("Stack:", err.stack);
  } finally {
    await pool.end();
  }
}

main();
