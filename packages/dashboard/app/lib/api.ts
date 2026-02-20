/**
 * 统一 API 客户端：标准错误格式 { ok, error?, code? }
 */

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

/**
 * 安全数字格式化：防止 NaN/undefined/null 导致 toFixed 报错
 */
export function safeNum(val: unknown, decimals = 2): string {
  const n = Number(val);
  return (isNaN(n) ? 0 : n).toFixed(decimals);
}

export async function apiFetch<T = unknown>(
  url: string,
  options?: RequestInit
): Promise<ApiResult<T>> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // 合并调用方传入的 headers
    if (options?.headers) {
      const incoming =
        options.headers instanceof Headers
          ? Object.fromEntries(options.headers.entries())
          : Array.isArray(options.headers)
            ? Object.fromEntries(options.headers)
            : (options.headers as Record<string, string>);
      Object.assign(headers, incoming);
    }

    // 自动注入 Authorization header
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("token");
      if (token && !headers["Authorization"] && !headers["authorization"]) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }

    const res = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });

    // 全局 401 处理：清除凭证并跳转登录
    if (res.status === 401) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
        localStorage.removeItem("username");
        localStorage.removeItem("userId");
        document.cookie = "auth_token=; path=/; max-age=0";
        window.location.href = "/login";
      }
      return { ok: false, error: "会话已过期，请重新登录", code: "UNAUTHORIZED" };
    }

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message =
        typeof body?.error === "string"
          ? body.error
          : body?.message || `请求失败 (${res.status})`;
      return {
        ok: false,
        error: message,
        code: body?.code ?? `HTTP_${res.status}`,
      };
    }
    return { ok: true, data: body as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : "网络异常";
    return { ok: false, error: message, code: "NETWORK_ERROR" };
  }
}
