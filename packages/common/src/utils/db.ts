// ============================================
// Database Connection Pool
// ============================================

import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getDbPool(): pg.Pool {
  if (!pool) {
    const isSupabase = (process.env.POSTGRES_HOST || "").includes("supabase");
    pool = new Pool({
      host: process.env.POSTGRES_HOST || "localhost",
      port: parseInt(process.env.POSTGRES_PORT || "5433"),
      database: process.env.POSTGRES_DB || "defi_yield",
      user: process.env.POSTGRES_USER || "defi",
      password: process.env.POSTGRES_PASSWORD || "change_me_in_production",
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const db = getDbPool();
  return db.query<T>(text, params);
}
