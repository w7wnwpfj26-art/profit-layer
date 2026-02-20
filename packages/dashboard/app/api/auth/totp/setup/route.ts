import { NextResponse } from "next/server";
import { generateSecret, generateURI } from "otplib";
import { toDataURL } from "qrcode";
import { getPool } from "../../../../lib/db";

const pool = getPool();

// POST /api/auth/totp/setup - 生成 TOTP secret + QR code
export async function POST(request: Request) {
  const userId = request.headers.get("x-user-id");
  const username = request.headers.get("x-username");
  if (!userId) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    // 检查是否已启用
    const existing = await pool.query(
      "SELECT totp_enabled FROM users WHERE id = $1",
      [userId]
    );
    if (existing.rows[0]?.totp_enabled) {
      return NextResponse.json(
        { error: "2FA 已启用，请先禁用后再重新设置" },
        { status: 400 }
      );
    }

    // 生成 secret
    const secret = generateSecret();

    // 存入数据库（尚未启用）
    await pool.query("UPDATE users SET totp_secret = $1 WHERE id = $2", [
      secret,
      userId,
    ]);

    // 生成 QR code
    const otpauth = generateURI({
      strategy: "totp",
      issuer: "NexusYield",
      label: username || `user-${userId}`,
      secret,
    });
    const qrDataUrl = await toDataURL(otpauth, { width: 256, margin: 2 });

    return NextResponse.json({ secret, qrDataUrl });
  } catch (err) {
    console.error("TOTP setup error:", err);
    return NextResponse.json({ error: "设置失败" }, { status: 500 });
  }
}
