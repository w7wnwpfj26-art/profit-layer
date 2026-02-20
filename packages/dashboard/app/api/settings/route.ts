import { NextResponse } from "next/server";
import { getPool } from "../../lib/db";

const pool = getPool();

// GET: 读取所有配置
export async function GET() {
  try {
    const result = await pool.query(
      `SELECT key, value, description, category FROM system_config ORDER BY category, key`
    );

    // 敏感字段脱敏：API key 类字段只返回末尾 4 位
    const SENSITIVE_KEYS = new Set(["deepseek_api_key", "telegram_bot_token", "openai_api_key"]);
    const configs = result.rows.map((r) => ({
      key: r.key,
      value: SENSITIVE_KEYS.has(r.key) && r.value && r.value.length > 8
        ? "••••••••" + r.value.slice(-4)
        : r.value,
      description: r.description,
      category: r.category,
    }));

    // 最近审计日志
    const logs = await pool.query(
      `SELECT event_type, severity, source, message, created_at
       FROM audit_log ORDER BY created_at DESC LIMIT 30`
    );

    return NextResponse.json({
      configs,
      recentLogs: logs.rows.map((r) => ({
        eventType: r.event_type,
        severity: r.severity,
        source: r.source,
        message: r.message,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error("[API] error:", (err as Error).message);
    return NextResponse.json({ error: "服务器内部错误", configs: [] }, { status: 500 });
  }
}

// POST: 批量更新配置（接收 { configs: [{key, value}, ...] } 格式）
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const items: Array<{ key: string; value: string }> = body.configs || [];

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "请提供 configs 数组" }, { status: 400 });
    }

    // 支持更新已有配置或创建新配置
    const existing = await pool.query(`SELECT key FROM system_config`);
    const validKeys = new Set(existing.rows.map((r: any) => r.key));

    // 新配置项定义（允许自动创建）
    const NEW_CONFIG_DEFS: Record<string, { desc: string; cat: string }> = {
      ai_temperature: { desc: "AI 决策激进程度 (0.0-1.0)", cat: "ai" },
      ai_max_tokens: { desc: "AI 响应最大 Token 数", cat: "ai" },
      ai_model: { desc: "AI 模型选择", cat: "ai" },
      ai_base_url: { desc: "AI API 基础地址", cat: "ai" },
      ai_auto_approve: { desc: "AI 自动审批", cat: "ai" },
    };

    // 敏感字段：跳过脱敏占位值，避免覆盖真实密钥
    const SENSITIVE_KEYS = new Set(["deepseek_api_key", "telegram_bot_token", "openai_api_key"]);
    const MASK_PREFIX = "••••••••";

    const updated: string[] = [];
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      for (const item of items) {
        if (!item.key) continue;
        
        // 如果是新配置，先创建
        if (!validKeys.has(item.key) && NEW_CONFIG_DEFS[item.key]) {
          await client.query(
            `INSERT INTO system_config (key, value, description, category) VALUES ($1, $2, $3, $4)`,
            [item.key, String(item.value), NEW_CONFIG_DEFS[item.key].desc, NEW_CONFIG_DEFS[item.key].cat]
          );
          validKeys.add(item.key); 
          updated.push(item.key);
          continue;
        }
        
        // 如果是已知配置但数据库中不存在，先创建
        if (!validKeys.has(item.key) && ["ai_temperature", "ai_max_tokens"].includes(item.key)) {
          const desc = item.key === "ai_temperature" ? "AI 决策激进程度 (0.0-1.0)" : "AI 响应最大 Token 数";
          await client.query(
            `INSERT INTO system_config (key, value, description, category) VALUES ($1, $2, $3, $4)`,
            [item.key, String(item.value), desc, "ai"]
          );
          validKeys.add(item.key);
          updated.push(item.key);
          continue;
        }
        
        // 已有配置更新逻辑
        if (!validKeys.has(item.key)) continue;
        // 跳过脱敏占位值
        if (SENSITIVE_KEYS.has(item.key) && String(item.value).startsWith(MASK_PREFIX)) continue;
        await client.query(
          `UPDATE system_config SET value = $1, updated_at = NOW() WHERE key = $2`,
          [String(item.value), item.key]
        );
        updated.push(item.key);
      }
      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    // 记录审计日志（敏感字段不记录明文值）
    if (updated.length > 0) {
      const changedMap: Record<string, string> = {};
      for (const item of items) {
        if (!updated.includes(item.key)) continue;
        changedMap[item.key] = SENSITIVE_KEYS.has(item.key) ? "***" : item.value;
      }
      await pool.query(
        `INSERT INTO audit_log (event_type, severity, source, message, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          "config_updated",
          updated.includes("kill_switch") || updated.includes("autopilot_enabled") ? "warning" : "info",
          "dashboard",
          `配置已更新: ${updated.join(", ")}`,
          JSON.stringify(changedMap),
        ]
      );
    }

    return NextResponse.json({ success: true, updated });
  } catch (err) {
    console.error("[API] error:", (err as Error).message);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
