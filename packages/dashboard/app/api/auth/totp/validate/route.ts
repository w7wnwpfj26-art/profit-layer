import { NextResponse } from "next/server";
import crypto from "crypto";
import { verify as otpVerify } from "otplib";
import { getPool } from "../../../../lib/db";

const pool = getPool();
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** 验证 TOTP 临时 token */
function verifyTempToken(tempToken: string): number | null {
  if (!JWT_SECRET) return null;
  try {
    const parts = tempToken.split(".");
    if (parts.length !== 2) return null;
    const [data, sig] = parts;
    const expectedSig = crypto
      .createHmac("sha256", JWT_SECRET + "_totp")
      .update(data)
      .digest("base64url");
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (
      sigBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expectedBuf)
    ) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    if (payload.exp < Date.now()) return null;
    return payload.userId;
  } catch {
    return null;
  }
}

/** 生成正式 JWT token */
function generateToken(userId: number, username: string): string {
  if (!JWT_SECRET) throw new Error("JWT_SECRET not configured");
  const payload = { userId, username, exp: Date.now() + TOKEN_EXPIRY_MS };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(data)
    .digest("base64url");
  return `${data}.${sig}`;
}

// POST /api/auth/totp/validate - 登录时验证 TOTP（公开路由）
export async function POST(request: Request) {
  if (!JWT_SECRET) {
    return NextResponse.json({ error: "服务器配置缺失" }, { status: 500 });
  }

  try {
    const { tempToken, code } = await request.json();
    if (!tempToken || !code || code.length !== 6) {
      return NextResponse.json(
        { error: "参数不完整" },
        { status: 400 }
      );
    }

    // 验证临时 token
    const userId = verifyTempToken(tempToken);
    if (!userId) {
      return NextResponse.json(
        { error: "临时令牌无效或已过期，请重新登录" },
        { status: 401 }
      );
    }

    // 获取用户信息
    const result = await pool.query(
      "SELECT username, totp_secret, totp_enabled FROM users WHERE id = $1",
      [userId]
    );
    const user = result.rows[0];
    if (!user || !user.totp_enabled || !user.totp_secret) {
      return NextResponse.json({ error: "2FA 未启用" }, { status: 400 });
    }

    // 验证 TOTP
    const isValid = await otpVerify({ token: code, secret: user.totp_secret });
    if (!isValid) {
      return NextResponse.json({ error: "验证码错误" }, { status: 401 });
    }

    // 签发正式 token
    const token = generateToken(userId, user.username);
    await pool.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [
      userId,
    ]);

    const response = NextResponse.json({
      token,
      username: user.username,
      userId,
    });
    response.cookies.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
    return response;
  } catch (err) {
    console.error("TOTP validate error:", err);
    return NextResponse.json({ error: "验证失败" }, { status: 500 });
  }
}
