#!/usr/bin/env node
import pg from "pg";
import fs from "fs";

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
    console.log("=== Running Migration: 010_add_entry_value_usd.sql ===\n");

    const sql = fs.readFileSync("infra/postgres/migrations/010_add_entry_value_usd.sql", "utf8");

    await pool.query(sql);

    console.log("✓ Migration completed successfully\n");

    // 验证列已添加
    const result = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'positions' AND column_name = 'entry_value_usd'
    `);

    if (result.rows.length > 0) {
      console.log("✓ entry_value_usd column exists:", result.rows[0]);
    } else {
      console.log("✗ entry_value_usd column not found");
    }

    // 检查现有记录的 entry_value_usd 值
    const posResult = await pool.query(`
      SELECT position_id, value_usd, entry_value_usd
      FROM positions
      WHERE status = 'active'
    `);

    console.log(`\n✓ Updated ${posResult.rows.length} positions:`);
    posResult.rows.forEach(row => {
      console.log(`  ${row.position_id}: value=$${row.value_usd}, entry=$${row.entry_value_usd}`);
    });

  } catch (err) {
    console.error("Migration failed:", err.message);
    console.error(err.stack);
  } finally {
    await pool.end();
  }
}

main();
