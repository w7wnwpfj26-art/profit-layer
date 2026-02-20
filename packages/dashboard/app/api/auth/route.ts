import { NextResponse } from "next/server";
import crypto from "crypto";
import { getPool } from "../../lib/db";
import { verifyToken } from "../../lib/auth";

// 惰性获取连接池，避免模块加载时环境变量未就绪
const getDb = () => getPool();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("FATAL: JWT_SECRET 环境变量未设置，认证系统无法工作！");
}

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
}

function generateToken(userId: number, username: string): string {
  if (!JWT_SECRET) throw new Error("JWT_SECRET not configured");
  const payload = { userId, username, exp: Date.now() + TOKEN_EXPIRY_MS };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

/** 生成 TOTP 临时 token（5 分钟有效，不同签名密钥） */
function generateTempToken(userId: number): string {
  if (!JWT_SECRET) throw new Error("JWT_SECRET not configured");
  const payload = { userId, exp: Date.now() + 5 * 60 * 1000 };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", JWT_SECRET + "_totp")
    .update(data)
    .digest("base64url");
  return `${data}.${sig}`;
}

/** 设置认证 cookie */
function setAuthCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set("auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return response;
}

// POST /api/auth - Login / Register
export async function POST(request: Request) {
  if (!JWT_SECRET) {
    return NextResponse.json({ error: "服务器认证配置缺失" }, { status: 500 });
  }

  try {
    const { action, username, password } = await request.json();

    if (action === "register") {
      if (!username || !password || password.length < 6) {
        return NextResponse.json({ error: "用户名和密码（至少6位）为必填" }, { status: 400 });
      }
      const existing = await getDb().query("SELECT id FROM users WHERE username = $1", [username]);
      if (existing.rows.length > 0) {
        return NextResponse.json({ error: "用户名已存在" }, { status: 409 });
      }
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = hashPassword(password, salt);
      const result = await getDb().query(
        "INSERT INTO users (username, password_hash, salt) VALUES ($1, $2, $3) RETURNING id",
        [username, hash, salt]
      );
      const token = generateToken(result.rows[0].id, username);
      const response = NextResponse.json({ token, username, userId: result.rows[0].id });
      return setAuthCookie(response, token);
    }

    // 登录
    if (!username || !password) {
      return NextResponse.json({ error: "请输入用户名和密码" }, { status: 400 });
    }
    const result = await getDb().query(
      "SELECT id, username, password_hash, salt, role, totp_enabled FROM users WHERE username = $1",
      [username]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
    }
    const user = result.rows[0];
    const hash = hashPassword(password, user.salt);

    // 常量时间比较，防止时序攻击
    const hashBuf = Buffer.from(hash);
    const storedBuf = Buffer.from(user.password_hash);
    if (hashBuf.length !== storedBuf.length || !crypto.timingSafeEqual(hashBuf, storedBuf)) {
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
    }

    // 检查 TOTP 二次验证
    if (user.totp_enabled) {
      const tempToken = generateTempToken(user.id);
      return NextResponse.json({
        requireTotp: true,
        tempToken,
        message: "请输入 Google Authenticator 验证码",
      });
    }

    // 无 2FA，直接签发 token
    const token = generateToken(user.id, user.username);
    await getDb().query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);
    const response = NextResponse.json({
      token,
      username: user.username,
      userId: user.id,
      role: user.role,
    });
    return setAuthCookie(response, token);
  } catch (err) {
    console.error("Auth error:", err);
    return NextResponse.json({ error: "认证服务异常" }, { status: 500 });
  }
}

// GET /api/auth - Verify token + 返回 totp 状态
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "未提供令牌" }, { status: 401 });
  }
  const user = verifyToken(token);
  if (!user) {
    return NextResponse.json({ error: "令牌无效或已过期" }, { status: 401 });
  }

  try {
    const result = await getDb().query("SELECT totp_enabled FROM users WHERE id = $1", [user.userId]);
    const totpEnabled = result.rows[0]?.totp_enabled || false;
    return NextResponse.json({ userId: user.userId, username: user.username, totpEnabled });
  } catch {
    return NextResponse.json({ userId: user.userId, username: user.username, totpEnabled: false });
  }
}
