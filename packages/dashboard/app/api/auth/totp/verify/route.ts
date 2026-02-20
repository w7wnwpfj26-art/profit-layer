import { NextResponse } from "next/server";
import { verify as otpVerify } from "otplib";
import { getPool } from "../../../../lib/db";

const pool = getPool();

// POST /api/auth/totp/verify - 验证 TOTP 码并启用 2FA
export async function POST(request: Request) {
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const { code } = await request.json();
    if (!code || code.length !== 6) {
      return NextResponse.json({ error: "请输入 6 位验证码" }, { status: 400 });
    }

    // 获取 secret
    const result = await pool.query(
      "SELECT totp_secret, totp_enabled FROM users WHERE id = $1",
      [userId]
    );
    const user = result.rows[0];
    if (!user?.totp_secret) {
      return NextResponse.json(
        { error: "请先执行 TOTP 设置" },
        { status: 400 }
      );
    }
    if (user.totp_enabled) {
      return NextResponse.json({ error: "2FA 已启用" }, { status: 400 });
    }

    // 验证
    const isValid = await otpVerify({ token: code, secret: user.totp_secret });
    if (!isValid) {
      return NextResponse.json({ error: "验证码错误，请重试" }, { status: 400 });
    }

    // 启用 2FA
    await pool.query(
      "UPDATE users SET totp_enabled = true WHERE id = $1",
      [userId]
    );

    return NextResponse.json({ success: true, message: "2FA 已成功启用" });
  } catch (err) {
    console.error("TOTP verify error:", err);
    return NextResponse.json({ error: "验证失败" }, { status: 500 });
  }
}
