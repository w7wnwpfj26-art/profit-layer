import { NextRequest, NextFetchEvent, NextResponse } from "next/server";

// 本地内存限流器（开发环境）
class LocalRatelimit {
  private limits = new Map<string, { count: number; resetTime: number }>();
  private windowMs: number;

  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  async limit(identifier: string): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
    const now = Date.now();
    const key = `${identifier}:${Math.floor(now / this.windowMs)}`;

    const record = this.limits.get(key) || { count: 0, resetTime: now + this.windowMs };

    if (now >= record.resetTime) {
      this.limits.delete(key);
      record.count = 0;
      record.resetTime = now + this.windowMs;
    }

    if (record.count >= 100) {
      return {
        success: false,
        limit: 100,
        remaining: 0,
        reset: record.resetTime
      };
    }

    record.count++;
    this.limits.set(key, record);

    return {
      success: true,
      limit: 100,
      remaining: 100 - record.count,
      reset: record.resetTime
    };
  }
}

const ratelimit = new LocalRatelimit(60 * 1000);
const loginRatelimit = new LocalRatelimit(60 * 1000);

export async function proxy(
  request: NextRequest,
  event: NextFetchEvent
): Promise<Response | undefined> {
  const ip = request.headers.get("x-forwarded-for")?.split(',')[0]?.trim() ||
             request.headers.get("x-real-ip") ||
             "127.0.0.1";
  const userAgent = request.headers.get("user-agent") || "";

  // 跳过静态资源
  if (request.nextUrl.pathname.startsWith("/_next/") ||
      request.nextUrl.pathname.startsWith("/static/")) {
    return undefined;
  }

  // 特殊限制：登录接口 (5次/分钟)
  if (request.nextUrl.pathname === "/api/auth" && request.method === "POST") {
    const { success, limit, remaining, reset } = await loginRatelimit.limit(ip);

    if (!success) {
      return NextResponse.json(
        { error: "请求过于频繁，请稍后再试" },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": remaining.toString(),
            "X-RateLimit-Reset": reset.toString(),
          }
        }
      );
    }
    return undefined;
  }

  // 通用 API 限流 (100次/分钟)
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const identifier = `${ip}:${userAgent.substring(0, 50)}`;
    const { success, limit, remaining, reset } = await ratelimit.limit(identifier);

    if (!success) {
      return NextResponse.json(
        { error: "API 调用频率过高" },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": remaining.toString(),
            "X-RateLimit-Reset": reset.toString(),
          }
        }
      );
    }
  }

  return undefined;
}
