import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";

const pool = getPool();
const AI_ENGINE_URL = process.env.AI_ENGINE_URL || "http://localhost:8000";

export async function GET() {
  try {
    // 先从数据库读 AI 配置
    const configResult = await pool.query(
      `SELECT key, value FROM system_config WHERE key IN ('deepseek_api_key', 'glm_api_key', 'ai_model', 'ai_base_url', 'ai_auto_approve')`
    );
    const cfg: Record<string, string> = {};
    for (const r of configResult.rows) cfg[r.key] = r.value;

    // 支持 GLM-5 或 DeepSeek（优先使用 .env）
    const apiKey = cfg.glm_api_key || process.env.GLM_API_KEY || cfg.deepseek_api_key || process.env.DEEPSEEK_API_KEY;
    const model = cfg.ai_model || process.env.AI_MODEL || "glm-5";
    const baseUrl = cfg.ai_base_url || process.env.AI_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
    const hasKey = !!(apiKey);

    // 尝试请求 AI Engine 的 /ai/status
    let engineOnline = false;
    try {
      const res = await fetch(`${AI_ENGINE_URL}/ai/status`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) engineOnline = true;
    } catch {}

    return NextResponse.json({
      enabled: hasKey,
      model,
      baseUrl,
      autoApprove: cfg.ai_auto_approve === "true",
      fallbackMode: !hasKey,
      engineOnline,
      message: hasKey
        ? (engineOnline ? "AI 顾问已就绪，引擎在线" : `GLM-5 API 已验证连通 (${model})`)
        : "未配置 API Key，使用内置规则引擎（免费但精度较低）",
    });
  } catch (err) {
    return NextResponse.json({
      enabled: false,
      model: null,
      fallbackMode: true,
      engineOnline: false,
      message: "状态查询失败",
    });
  }
}
