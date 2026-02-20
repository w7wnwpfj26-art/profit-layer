import { NextResponse } from "next/server";
import { getPool } from "../../lib/db";

const pool = getPool();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(parseInt(searchParams.get("days") || "7"), 90);

    const result = await pool.query(
      `SELECT 
        time_bucket('1 hour', time) AS time,
        AVG(total_value_usd)::numeric(20,2) AS value,
        AVG(total_pnl_usd)::numeric(20,2) AS pnl,
        MAX(positions_count) AS positions
       FROM position_pnl_snapshots
       WHERE time > NOW() - ($1 || ' days')::interval
       GROUP BY 1
       ORDER BY 1 ASC`,
      [String(days)]
    );

    return NextResponse.json({
      points: result.rows.map((r: any) => ({
        time: r.time,
        value: Number(r.value),
        pnl: Number(r.pnl),
        positions: Number(r.positions),
      })),
      count: result.rows.length,
      days,
    });
  } catch (err) {
    console.error("[API] error:", (err as Error).message);
    return NextResponse.json({ error: "服务器内部错误", points: [] }, { status: 500 });
  }
}
