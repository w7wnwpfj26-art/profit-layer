/**
 * 简易内存 Rate Limiter（适用于单实例部署）
 * 生产环境建议换 Redis 实现
 */
const hitMap = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitConfig {
  windowMs?: number;   // 时间窗口（毫秒），默认 60s
  maxRequests?: number; // 窗口内最大请求数，默认 60
}

export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = {}
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const windowMs = config.windowMs || 60_000;
  const maxRequests = config.maxRequests || 60;
  const now = Date.now();

  let entry = hitMap.get(identifier);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    hitMap.set(identifier, entry);
  }

  entry.count++;

  if (entry.count > maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: entry.resetAt - now,
    };
  }

  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    retryAfterMs: 0,
  };
}

/**
 * 从 Request 中提取客户端标识（IP 或 fallback）
 */
export function getClientId(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "anonymous"
  );
}
