import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";

const getDb = () => getPool();

/**
 * GET: 獲取待冷錢包簽名的交易
 * POST: 提交簽名後的交易數據
 */
export async function GET() {
  try {
    const result = await getDb().query(`
      SELECT id, chain_id, tx_type, amount_usd, payload, status 
      FROM pending_signatures 
      WHERE status = 'pending' 
      ORDER BY created_at ASC
    `);
    return NextResponse.json({ queue: result.rows });
  } catch (err) {
    console.error("[API] error:", (err as Error).message);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { id, txHash, action } = await request.json();

    // 输入校验
    if (!id || typeof id !== "number") {
      return NextResponse.json({ error: "无效的 id 参数" }, { status: 400 });
    }
    const VALID_ACTIONS = ["reject", "broadcasted", "signed"];
    if (!action || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json({ error: `无效的 action，允许: ${VALID_ACTIONS.join(", ")}` }, { status: 400 });
    }
    if (action !== "reject" && (!txHash || typeof txHash !== "string")) {
      return NextResponse.json({ error: "broadcasted/signed 操作需要 txHash" }, { status: 400 });
    }

    if (action === "reject") {
      await getDb().query("UPDATE pending_signatures SET status = 'rejected', updated_at = NOW() WHERE id = $1", [id]);
      return NextResponse.json({ success: true });
    }

    if (action === "broadcasted") {
      // 交易已经由 OKX 钱包广播，记录 txHash
      await getDb().query(`
        UPDATE pending_signatures 
        SET signature = $1, status = 'broadcasted', updated_at = NOW() 
        WHERE id = $2
      `, [txHash, id]);
      return NextResponse.json({ success: true, txHash });
    }

    // 兼容旧版 signed action
    if (action === "signed") {
      await getDb().query(`
        UPDATE pending_signatures 
        SET signature = $1, status = 'broadcasted', updated_at = NOW() 
        WHERE id = $2
      `, [txHash, id]);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[API] error:", (err as Error).message);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
