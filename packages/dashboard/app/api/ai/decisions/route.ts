import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";

const pool = getPool();

// GET: 获取 AI 决策历史
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  try {
    const result = await pool.query(
      `SELECT id, decision_type, pool_id, symbol, chain,
              expected_apr, confidence, reasoning,
              actual_outcome, actual_apr, evaluated_at, created_at
       FROM ai_decisions
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    const decisions = result.rows.map((r) => ({
      id: r.id,
      decisionType: r.decision_type,
      poolId: r.pool_id,
      symbol: r.symbol,
      chain: r.chain,
      expectedApr: Number(r.expected_apr),
      confidence: Number(r.confidence),
      reasoning: r.reasoning,
      actualOutcome: r.actual_outcome,
      actualApr: r.actual_apr != null ? Number(r.actual_apr) : null,
      evaluatedAt: r.evaluated_at,
      createdAt: r.created_at,
    }));

    // 统计准确率
    const evaluated = decisions.filter((d) => d.actualOutcome && d.actualOutcome !== "pending");
    const profitable = evaluated.filter((d) => d.actualOutcome === "profit");
    const accuracy = evaluated.length > 0 ? (profitable.length / evaluated.length) * 100 : null;

    return NextResponse.json({
      success: true,
      decisions,
      stats: {
        total: decisions.length,
        evaluated: evaluated.length,
        profitable: profitable.length,
        accuracy: accuracy != null ? Math.round(accuracy) : null,
      },
    });
  } catch (err) {
    console.error("AI decisions GET error:", err);
    return NextResponse.json({
      success: true,
      decisions: [],
      stats: { total: 0, evaluated: 0, profitable: 0, accuracy: null },
    });
  }
}
