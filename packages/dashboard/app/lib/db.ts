import pg from "pg";

// 共享数据库连接池（单例）
let _pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!_pool) {
    const isSupabase = (process.env.POSTGRES_HOST || "").includes("supabase");
    _pool = new pg.Pool({
      host: process.env.POSTGRES_HOST || "localhost",
      port: parseInt(process.env.POSTGRES_PORT || "5433"),
      database: process.env.POSTGRES_DB || "defi_yield",
      user: process.env.POSTGRES_USER || "defi",
      password: process.env.POSTGRES_PASSWORD || "change_me_in_production",
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
    });

    _pool.on("error", (err) => {
      console.error("[DB] 连接池异常:", err.message);
    });
  }
  return _pool;
}

/**
 * 安全查询封装：自动 connect/release + 错误捕获
 */
export async function safeQuery<T = any>(
  text: string,
  params?: any[]
): Promise<{ ok: true; rows: T[] } | { ok: false; error: string }> {
  const client = await getPool().connect();
  try {
    const result = await client.query(text, params);
    return { ok: true, rows: result.rows as T[] };
  } catch (err) {
    console.error("[DB] 查询错误:", (err as Error).message);
    return { ok: false, error: (err as Error).message };
  } finally {
    client.release();
  }
}
