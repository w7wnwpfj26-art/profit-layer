import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";

const getDb = () => getPool();

/**
 * GET /api/ai/test
 * 测试 AI API 连接（支持 DeepSeek/OpenAI/智谱 GLM）
 */
export async function GET() {
  try {
    // 1. 从数据库读取 AI 配置
    const configResult = await getDb().query(
      `SELECT key, value FROM system_config WHERE key IN ('deepseek_api_key', 'zhipu_api_key', 'ai_model', 'ai_base_url')`
    );
    const cfg: Record<string, string> = {};
    for (const r of configResult.rows) cfg[r.key] = r.value;

    const model = cfg.ai_model || "deepseek-chat";
    
    // 2. 根据模型选择 API Key 和端点
    let apiKey: string | undefined;
    let endpoint: string;
    
    if (model.startsWith("glm")) {
      // 智谱 AI GLM 系列
      apiKey = cfg.zhipu_api_key;
      endpoint = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
      if (!apiKey) {
        return NextResponse.json({
          ok: false,
          msg: "未配置智谱 API Key，请先填入并保存",
        });
      }
    } else {
      // DeepSeek/OpenAI/其他
      apiKey = cfg.deepseek_api_key;
      const baseUrl = cfg.ai_base_url || "https://api.deepseek.com";
      
      if (!apiKey) {
        return NextResponse.json({
          ok: false,
          msg: "未配置 API Key，请先在上方填入 DeepSeek API Key 并保存",
        });
      }
      
      if (baseUrl.includes("deepseek")) {
        endpoint = `${baseUrl}/chat/completions`;
      } else if (baseUrl.includes("openai")) {
        endpoint = `${baseUrl}/v1/chat/completions`;
      } else if (baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1")) {
        endpoint = `${baseUrl}/api/chat`;
      } else {
        endpoint = `${baseUrl}/v1/chat/completions`;
      }
    }

    // 3. 发送最小化测试请求
    const testBody = {
      model,
      messages: [
        { role: "system", content: "你是 DeFi 策略 AI 顾问。请用一句简短中文回复。" },
        { role: "user", content: "你好，请确认你已上线。回复「AI 策略顾问已就绪」即可。" },
      ],
      temperature: 0.1,
      max_tokens: 100,
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(testBody),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errorText = await res.text();
      let errorMsg = `API 返回 ${res.status}`;
      try {
        const errJson = JSON.parse(errorText);
        errorMsg = errJson.error?.message || errJson.message || errorMsg;
      } catch {}
      return NextResponse.json({ ok: false, msg: `连接失败: ${errorMsg}` });
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || "（无回复内容）";
    const usage = data.usage;

    return NextResponse.json({
      ok: true,
      msg: `连接成功！模型: ${model}`,
      reply: reply.trim(),
      usage: usage ? {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      } : null,
    });
  } catch (err) {
    const message = (err as Error).message;
    let friendlyMsg = `测试异常: ${message}`;
    if (message.includes("fetch failed") || message.includes("ECONNREFUSED")) {
      friendlyMsg = "无法连接到 API 服务器，请检查「API 基础地址」是否正确";
    } else if (message.includes("timed out") || message.includes("TimeoutError")) {
      friendlyMsg = "请求超时（15秒），API 服务器无响应";
    }
    return NextResponse.json({ ok: false, msg: friendlyMsg });
  }
}
