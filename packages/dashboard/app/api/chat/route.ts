import { NextResponse } from "next/server";
import { getPool } from "../../lib/db";

const pool = getPool();

// AI Engine API URL
const AI_ENGINE_URL = process.env.AI_ENGINE_URL || "http://ai-engine:8000";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

// 获取系统上下文数据
async function getSystemContext(): Promise<string> {
  try {
    const [poolStats, positions, alerts] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) as total, ROUND(SUM(tvl_usd)::numeric/1e9, 2) as tvl_b, 
               ROUND(AVG(apr_total)::numeric, 1) as avg_apr
        FROM pools WHERE tvl_usd > 0
      `),
      pool.query(`
        SELECT COUNT(*) as count, ROUND(SUM(value_usd)::numeric, 2) as value,
               ROUND(SUM(unrealized_pnl_usd)::numeric, 2) as pnl
        FROM positions WHERE status = 'active'
      `),
      pool.query(`
        SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE severity = 'critical') as critical
        FROM alert_events WHERE triggered_at > NOW() - INTERVAL '24 hours'
      `),
    ]);

    const ps = poolStats.rows[0];
    const pos = positions.rows[0];
    const alt = alerts.rows[0];

    // 只发送脱敏的统计摘要，不暴露精确金额
    return `系统概况：
- 监控池子：${ps.total}个，平均APR ${ps.avg_apr}%
- 活跃持仓：${pos.count}个
- 24h告警：${alt.total}个（${alt.critical}个严重）`;
  } catch {
    return "系统数据获取中...";
  }
}

// 查询持仓详情
async function getPositionsDetail(): Promise<string> {
  try {
    const result = await pool.query(`
      SELECT p.id, pl.protocol_id, pl.symbol, p.chain_id, p.value_usd, 
             p.unrealized_pnl_usd, pl.apr_total
      FROM positions p
      LEFT JOIN pools pl ON p.pool_id = pl.pool_id
      WHERE p.status = 'active'
      ORDER BY p.value_usd DESC
      LIMIT 10
    `);

    if (result.rows.length === 0) {
      return "当前没有活跃持仓。";
    }

    let text = `📊 **当前持仓 (${result.rows.length}个)**\n\n`;
    let totalValue = 0;
    let totalPnl = 0;

    result.rows.forEach((pos, i) => {
      const pnl = parseFloat(pos.unrealized_pnl_usd) || 0;
      const value = parseFloat(pos.value_usd) || 0;
      totalValue += value;
      totalPnl += pnl;
      const pnlIcon = pnl >= 0 ? "🟢" : "🔴";
      text += `**${i + 1}. ${pos.protocol_id || "Unknown"} - ${pos.symbol || "N/A"}**\n`;
      text += `   链: ${pos.chain_id} | 价值: $${value.toFixed(2)}\n`;
      text += `   ${pnlIcon} 盈亏: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} | APR: ${parseFloat(pos.apr_total || 0).toFixed(1)}%\n\n`;
    });

    const totalPnlIcon = totalPnl >= 0 ? "🟢" : "🔴";
    text += `---\n💰 **总价值: $${totalValue.toFixed(2)}**\n${totalPnlIcon} **总盈亏: ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}**`;

    return text;
  } catch (e) {
    console.error("查询持仓失败:", e);
    return "查询持仓数据失败，请稍后重试。";
  }
}

// 查询高收益池子
async function getTopYieldPools(): Promise<string> {
  try {
    const result = await pool.query(`
      SELECT protocol_id, symbol, chain_id, apr_total, tvl_usd, health_score, COALESCE((metadata->>'risk_score')::numeric, 50) as risk_score
      FROM pools
      WHERE tvl_usd > 10000 AND apr_total >= 1000
      ORDER BY apr_total DESC
      LIMIT 10
    `);

    if (result.rows.length === 0) {
      return "暂无符合条件的高收益池子。";
    }

    let text = `🔥 **高收益池推荐 TOP ${result.rows.length}**\n\n`;

    result.rows.forEach((p, i) => {
      const apr = parseFloat(p.apr_total) || 0;
      const tvl = parseFloat(p.tvl_usd) || 0;
      const health = parseFloat(p.health_score) || 0;
      const risk = parseFloat(p.risk_score) || 0;

      let riskLabel = "🟢低风险";
      if (risk > 70) riskLabel = "🔴高风险";
      else if (risk > 40) riskLabel = "🟡中风险";

      text += `**${i + 1}. ${p.protocol_id} - ${p.symbol}**\n`;
      text += `   链: ${p.chain_id} | APR: ${apr.toFixed(1)}%\n`;
      text += `   TVL: $${(tvl / 1e6).toFixed(2)}M | 健康分: ${health.toFixed(0)} | ${riskLabel}\n\n`;
    });

    text += `---\n💡 健康分越高越安全，风险分越低越稳健。\n需要投资某个池子吗？告诉我池子名称和金额。`;

    return text;
  } catch (e) {
    console.error("查询池子失败:", e);
    return "查询池子数据失败，请稍后重试。";
  }
}

// 查询告警信息
async function getAlerts(): Promise<string> {
  try {
    const result = await pool.query(`
      SELECT rule_id, severity, protocol_id, message, triggered_at
      FROM alert_events
      WHERE triggered_at > NOW() - INTERVAL '24 hours'
      ORDER BY triggered_at DESC
      LIMIT 10
    `);

    if (result.rows.length === 0) {
      return "✅ 过去24小时内没有告警，系统运行正常。";
    }

    let text = `⚠️ **最近告警 (24h内 ${result.rows.length}条)**\n\n`;

    result.rows.forEach((a, i) => {
      const severity = a.severity === "critical" ? "🔴严重" : a.severity === "warning" ? "🟡警告" : "🔵提示";
      text += `${i + 1}. ${severity} **${a.rule_id}**\n`;
      text += `   协议: ${a.protocol_id || "系统"} | ${a.message}\n\n`;
    });

    return text;
  } catch (e) {
    console.error("查询告警失败:", e);
    return "查询告警数据失败。";
  }
}

// 智能响应生成（本地兜底）
async function getSmartResponse(message: string, context: string): Promise<string> {
  const lowerMsg = message.toLowerCase();

  // 持仓查询
  if (lowerMsg.includes("持仓") || lowerMsg.includes("position") || lowerMsg.includes("哪些") || lowerMsg.includes("我有")) {
    return await getPositionsDetail();
  }

  // 高收益池查询
  if (
    lowerMsg.includes("收益") ||
    lowerMsg.includes("apr") ||
    lowerMsg.includes("yield") ||
    lowerMsg.includes("推荐") ||
    lowerMsg.includes("机会") ||
    lowerMsg.includes("池子") ||
    lowerMsg.includes("挖矿")
  ) {
    return await getTopYieldPools();
  }

  // 告警查询
  if (lowerMsg.includes("告警") || lowerMsg.includes("alert") || lowerMsg.includes("风险") || lowerMsg.includes("警告")) {
    return await getAlerts();
  }

  // 投资意图
  if (lowerMsg.includes("投资") || lowerMsg.includes("买入") || lowerMsg.includes("invest") || lowerMsg.includes("入金")) {
    const poolsInfo = await getTopYieldPools();
    return `好的，我来帮你找投资机会！\n\n${poolsInfo}\n\n---\n请告诉我：\n1. 投资金额（如：$100、0.1 ETH）\n2. 选择哪个池子（序号或名称）`;
  }

  // 撤销意图
  if (lowerMsg.includes("撤销") || lowerMsg.includes("退出") || lowerMsg.includes("withdraw") || lowerMsg.includes("提现")) {
    const positionsInfo = await getPositionsDetail();
    return `好的，这是你当前的持仓：\n\n${positionsInfo}\n\n---\n请告诉我要撤销哪个持仓（序号或协议名称）。`;
  }

  // 帮助
  if (lowerMsg.includes("帮助") || lowerMsg.includes("help") || lowerMsg.includes("能做什么") || lowerMsg.includes("你好") || lowerMsg.includes("hi")) {
    return `你好！我是 ProfitLayer AI 助手 🤖\n\n${context}\n\n**我可以帮你：**\n• **「查看持仓」** - 查看当前所有持仓和盈亏\n• **「推荐池子」** - 获取高收益投资机会\n• **「查看告警」** - 查看风险告警\n• **「投资 xxx」** - 执行投资操作\n• **「撤销 xxx」** - 撤销某个持仓\n\n直接输入你的需求，我来帮你处理！`;
  }

  // 默认：返回概览 + 持仓
  const positionsInfo = await getPositionsDetail();
  return `${context}\n\n${positionsInfo}\n\n---\n有什么我可以帮你的？试试说：\n• "推荐高收益池子"\n• "查看告警"\n• "帮我投资"`;
}

// 直接调用 DeepSeek/OpenAI API（当 AI Engine 不可用时）
async function callDirectLLM(
  messages: ChatMessage[],
  context: string,
  apiKey: string,
  model: string,
  baseUrl: string
): Promise<string | null> {
  const endpoint = baseUrl.includes("deepseek.com")
    ? `${baseUrl}/chat/completions`
    : baseUrl.includes("openai.com")
      ? `${baseUrl}/v1/chat/completions`
      : `${baseUrl}/v1/chat/completions`;

  const systemPrompt = `你是 ProfitLayer 的 DeFi 智能助手。你有以下系统上下文：

${context}

请基于 DeFi 收益、持仓、风险等话题，用简洁专业的中文回答问题。若涉及投资建议，请提醒用户风险。`;

  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    temperature: 0.7,
    max_tokens: 1024,
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[Chat] Direct LLM error:", res.status, err);
    return null;
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages } = body as { messages: ChatMessage[] };

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "消息不能为空" }, { status: 400 });
    }

    const userMessage = messages[messages.length - 1].content;
    const context = await getSystemContext();

    // 1. 尝试 AI Engine
    try {
      // 注入系统提示词，强制要求中文回复
      const messagesWithSystem = [
        {
          role: "system",
          content: `You are ProfitLayer AI Assistant. Always respond in Chinese (Simplified). Use professional DeFi terminology. Context:\n${context}`,
        },
        ...messages,
      ];

      const aiResponse = await fetch(`${AI_ENGINE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messagesWithSystem, context }),
        signal: AbortSignal.timeout(10000),
      });

      if (aiResponse.ok) {
        const data = await aiResponse.json();
        return NextResponse.json({
          message: data.response || data.message,
          context,
          source: "ai_engine",
        });
      }
    } catch {
      // AI Engine 不可用，继续
    }

    // 2. 尝试直接 DeepSeek/OpenAI（从 DB 读取配置）
    const configResult = await pool.query(
      `SELECT key, value FROM system_config WHERE key IN ('deepseek_api_key', 'ai_model', 'ai_base_url')`
    );
    const cfg: Record<string, string> = {};
    for (const r of configResult.rows) cfg[r.key] = r.value;

    const apiKey = cfg.deepseek_api_key;
    const model = cfg.ai_model || "deepseek-chat";
    const baseUrl = cfg.ai_base_url || "https://api.deepseek.com";

    if (apiKey) {
      const directReply = await callDirectLLM(messages, context, apiKey, model, baseUrl);
      if (directReply) {
        return NextResponse.json({
          message: directReply,
          context,
          source: "direct_llm",
        });
      }
    }

    // 3. 智能关键词兜底
    const response = await getSmartResponse(userMessage, context);

    return NextResponse.json({
      message: response,
      context,
      source: "smart_reply",
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: "处理消息失败" }, { status: 500 });
  }
}
