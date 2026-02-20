import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";

const pool = getPool();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

    const result = await pool.query(
      `SELECT cycle_id, input_summary, output_summary, full_input, full_output,
              duration_ms, actions_taken, created_at
       FROM ai_think_log ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );

    return NextResponse.json({
      logs: result.rows.map((r: any) => ({
        cycleId: r.cycle_id,
        inputSummary: r.input_summary,
        outputSummary: r.output_summary,
        fullInput: r.full_input,
        fullOutput: r.full_output,
        durationMs: r.duration_ms,
        actionsTaken: r.actions_taken,
        createdAt: r.created_at,
      })),
      count: result.rows.length,
    });
  } catch (err) {
    console.error("[API] error:", (err as Error).message);
    return NextResponse.json({ logs: [], count: 0, error: "服务器内部错误" }, { status: 500 });
  }
}
