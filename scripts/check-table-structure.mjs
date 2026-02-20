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
    console.log("=== Positions Table Structure ===\n");

    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'positions'
      ORDER BY ordinal_position
    `);

    console.log("Columns:");
    result.rows.forEach(row => {
      console.log(`  ${row.column_name.padEnd(30)} ${row.data_type.padEnd(20)} ${row.is_nullable}`);
    });

    // 检查是否有 entry_value_usd 列
    const hasEntryValue = result.rows.some(r => r.column_name === 'entry_value_usd');
    console.log(`\nHas entry_value_usd column: ${hasEntryValue}`);

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await pool.end();
  }
}

main();
