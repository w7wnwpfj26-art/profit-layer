import crypto from "crypto";
import { NextResponse } from "next/server";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("[AUTH] JWT_SECRET 环境变量未设置！");
}

export function verifyToken(token: string): { userId: number; username: string } | null {
  if (!JWT_SECRET) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [data, sig] = parts;
    const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(data).digest("base64url");
    // 使用常量时间比较防止时序攻击
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    if (payload.exp < Date.now()) return null;
    return { userId: payload.userId, username: payload.username };
  } catch {
    return null;
  }
}

/**
 * 从请求中提取并验证 token。
 * 支持 Authorization: Bearer xxx 和 cookie 中的 token。
 */
export function authenticateRequest(request: Request): { userId: number; username: string } | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return verifyToken(authHeader.slice(7));
  }
  return null;
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "未授权，请先登录" }, { status: 401 });
}
