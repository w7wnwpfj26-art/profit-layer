import { NextResponse } from "next/server";
import { getPool } from "../../lib/db";

const pool = getPool();

// Telegram Bot API
const TG_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

// Webhook URL
const WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || "";

export interface AlertPayload {
  severity: "info" | "warning" | "error" | "critical";
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
}

async function sendTelegram(text: string): Promise<boolean> {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return false;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TG_CHAT_ID,
          text,
          parse_mode: "HTML",
        }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function sendWebhook(payload: AlertPayload): Promise<boolean> {
  if (!WEBHOOK_URL) return false;
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        timestamp: new Date().toISOString(),
        app: "ProfitLayer",
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function formatTelegramMessage(alert: AlertPayload): string {
  const icon = {
    info: "ℹ️",
    warning: "⚠️",
    error: "❌",
    critical: "🚨",
  }[alert.severity];

  return [
    `${icon} <b>ProfitLayer - ${alert.severity.toUpperCase()}</b>`,
    ``,
    `<b>来源:</b> ${alert.source}`,
    `<b>消息:</b> ${alert.message}`,
    alert.metadata ? `<b>详情:</b> <code>${JSON.stringify(alert.metadata)}</code>` : "",
    `<b>时间:</b> ${new Date().toLocaleString("zh-CN")}`,
  ].filter(Boolean).join("\n");
}

// POST /api/notifications - Send an alert
export async function POST(request: Request) {
  try {
    const body: AlertPayload = await request.json();

    // 1. 写入审计日志
    await pool.query(
      `INSERT INTO audit_log (event_type, severity, source, message, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        `alert_${body.severity}`,
        body.severity,
        body.source,
        body.message,
        JSON.stringify(body.metadata || {}),
      ]
    );

    // 2. 发送 Telegram
    let tgSent = false;
    if (body.severity !== "info") {
      tgSent = await sendTelegram(formatTelegramMessage(body));
    }

    // 3. 发送 Webhook
    let webhookSent = false;
    if (body.severity === "error" || body.severity === "critical") {
      webhookSent = await sendWebhook(body);
    }

    return NextResponse.json({
      success: true,
      channels: {
        database: true,
        telegram: tgSent,
        webhook: webhookSent,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// GET /api/notifications - Get recent alerts
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const severity = searchParams.get("severity");

    let where = "WHERE 1=1";
    const params: (string | number)[] = [];
    let idx = 1;

    if (severity) {
      where += ` AND severity = $${idx}`;
      params.push(severity);
      idx++;
    }

    const result = await pool.query(
      `SELECT id, event_type, severity, source, message, metadata, created_at
       FROM audit_log ${where}
       ORDER BY created_at DESC
       LIMIT $${idx}`,
      [...params, limit]
    );

    return NextResponse.json({
      alerts: result.rows.map((r) => ({
        id: r.id,
        eventType: r.event_type,
        severity: r.severity,
        source: r.source,
        message: r.message,
        metadata: r.metadata,
        createdAt: r.created_at,
      })),
      total: result.rows.length,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, alerts: [] }, { status: 500 });
  }
}
