// 告警检测服务
// @ts-ignore
import { Pool } from "pg";
import { v4 as uuid } from "uuid";
import { fileURLToPath } from "node:url";
import path from "node:path";

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5433"),
  database: process.env.POSTGRES_DB || "defi_yield",
  user: process.env.POSTGRES_USER || "defi",
  password: process.env.POSTGRES_PASSWORD || "defi123",
});

interface AlertRule {
  rule_id: string;
  name: string;
  metric_type: string;
  condition: string;
  threshold: number;
  time_window_minutes: number;
  severity: string;
  channels: string[];
  cooldown_minutes: number;
}

interface AlertEvent {
  event_id: string;
  rule_id: string;
  pool_id?: string;
  chain_id?: string;
  protocol_id?: string;
  metric_value: number;
  threshold_value: number;
  severity: string;
  message: string;
  metadata?: Record<string, unknown>;
}

// 获取启用的告警规则
async function getActiveRules(): Promise<AlertRule[]> {
  const result = await pool.query(
    "SELECT * FROM alert_rules WHERE enabled = true"
  );
  return result.rows.map((r: Record<string, unknown>) => ({
    ...r,
    channels: typeof r.channels === "string" ? JSON.parse(r.channels) : r.channels,
  }));
}

// 检查是否在冷却期
async function isInCooldown(ruleId: string, poolId?: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM alert_events 
     WHERE rule_id = $1 
     AND ($2::text IS NULL OR pool_id = $2)
     AND triggered_at > NOW() - INTERVAL '30 minutes'
     AND status != 'resolved'
     LIMIT 1`,
    [ruleId, poolId || null]
  );
  return result.rows.length > 0;
}

// 创建告警事件
async function createAlertEvent(event: AlertEvent): Promise<void> {
  await pool.query(
    `INSERT INTO alert_events 
     (event_id, rule_id, pool_id, chain_id, protocol_id, metric_value, threshold_value, severity, message, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      event.event_id,
      event.rule_id,
      event.pool_id,
      event.chain_id,
      event.protocol_id,
      event.metric_value,
      event.threshold_value,
      event.severity,
      event.message,
      JSON.stringify(event.metadata || {}),
    ]
  );
  console.log(`🚨 告警: [${event.severity.toUpperCase()}] ${event.message}`);
}

// 发送 Webhook 通知
async function sendWebhook(event: AlertEvent, webhookUrl: string): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: event.event_id,
        severity: event.severity,
        message: event.message,
        pool_id: event.pool_id,
        chain_id: event.chain_id,
        metric_value: event.metric_value,
        threshold_value: event.threshold_value,
        timestamp: new Date().toISOString(),
      }),
    });
    console.log(`📤 Webhook 已发送: ${webhookUrl}`);
  } catch (err) {
    console.error(`❌ Webhook 发送失败: ${(err as Error).message}`);
  }
}

// 检测 TVL 下降
async function checkTvlDrop(rule: AlertRule): Promise<void> {
  // 获取 5 分钟内 TVL 变化
  const result = await pool.query(`
    WITH current_tvl AS (
      SELECT pool_id, symbol, chain_id, protocol_id, tvl_usd, health_score
      FROM pools WHERE tvl_usd > 0
    ),
    -- 这里假设有历史快照表，如果没有则跳过
    tvl_check AS (
      SELECT pool_id, symbol, chain_id, protocol_id, tvl_usd, health_score
      FROM current_tvl
      WHERE health_score < 30  -- 低健康分池子
    )
    SELECT * FROM tvl_check LIMIT 10
  `);

  for (const row of result.rows) {
    const inCooldown = await isInCooldown(rule.rule_id, row.pool_id);
    if (inCooldown) continue;

    // 健康分低于阈值时触发
    if (row.health_score < 20) {
      const event: AlertEvent = {
        event_id: uuid(),
        rule_id: "health-score-low",
        pool_id: row.pool_id,
        chain_id: row.chain_id,
        protocol_id: row.protocol_id,
        metric_value: row.health_score,
        threshold_value: 20,
        severity: "warning",
        message: `${row.symbol} (${row.chain_id}) 健康分过低: ${row.health_score}`,
        metadata: { tvl_usd: row.tvl_usd },
      };
      await createAlertEvent(event);
    }
  }
}

// 检测 APR 异常
async function checkAprSpike(rule: AlertRule): Promise<void> {
  const result = await pool.query(`
    SELECT pool_id, symbol, chain_id, protocol_id, apr_total, health_score, tvl_usd
    FROM pools 
    WHERE apr_total > 10000 AND health_score < 30
    LIMIT 10
  `);

  for (const row of result.rows) {
    const inCooldown = await isInCooldown(rule.rule_id, row.pool_id);
    if (inCooldown) continue;

    const event: AlertEvent = {
      event_id: uuid(),
      rule_id: rule.rule_id,
      pool_id: row.pool_id,
      chain_id: row.chain_id,
      protocol_id: row.protocol_id,
      metric_value: row.apr_total,
      threshold_value: rule.threshold,
      severity: rule.severity,
      message: `${row.symbol} (${row.chain_id}) APR 异常: ${row.apr_total.toFixed(0)}% (健康分: ${row.health_score})`,
      metadata: { tvl_usd: row.tvl_usd, health_score: row.health_score },
    };
    await createAlertEvent(event);
  }
}

// 检测持仓亏损
async function checkPositionLoss(rule: AlertRule): Promise<void> {
  const result = await pool.query(`
    SELECT position_id, pool_id, chain_id, value_usd, 
           COALESCE(unrealized_pnl_usd, 0) as unrealized_pnl_usd,
           CASE WHEN value_usd > 0 THEN (COALESCE(unrealized_pnl_usd, 0) / value_usd * 100) ELSE 0 END as pnl_pct
    FROM positions 
    WHERE status = 'active' 
    AND COALESCE(unrealized_pnl_usd, 0) < 0
  `);

  for (const row of result.rows) {
    if (row.pnl_pct < rule.threshold) {
      const inCooldown = await isInCooldown(rule.rule_id, row.position_id);
      if (inCooldown) continue;

      const event: AlertEvent = {
        event_id: uuid(),
        rule_id: rule.rule_id,
        pool_id: row.pool_id,
        chain_id: row.chain_id,
        metric_value: row.pnl_pct,
        threshold_value: rule.threshold,
        severity: rule.severity,
        message: `持仓 ${row.position_id} 亏损 ${row.pnl_pct.toFixed(2)}% ($${row.unrealized_pnl_usd.toFixed(2)})`,
        metadata: { value_usd: row.value_usd },
      };
      await createAlertEvent(event);
    }
  }
}

// 检测流动性枯竭
async function checkLiquidityDrain(rule: AlertRule): Promise<void> {
  const result = await pool.query(`
    SELECT p.pool_id, p.symbol, p.chain_id, p.protocol_id, p.tvl_usd
    FROM pools p
    JOIN positions pos ON p.pool_id = pos.pool_id
    WHERE pos.status = 'active' AND p.tvl_usd < $1
  `, [rule.threshold]);

  for (const row of result.rows) {
    const inCooldown = await isInCooldown(rule.rule_id, row.pool_id);
    if (inCooldown) continue;

    const event: AlertEvent = {
      event_id: uuid(),
      rule_id: rule.rule_id,
      pool_id: row.pool_id,
      chain_id: row.chain_id,
      protocol_id: row.protocol_id,
      metric_value: row.tvl_usd,
      threshold_value: rule.threshold,
      severity: rule.severity,
      message: `${row.symbol} (${row.chain_id}) TVL 过低: $${row.tvl_usd.toFixed(0)}`,
    };
    await createAlertEvent(event);
  }
}

// 主检测循环
export async function runAlertCheck(): Promise<void> {
  console.log("🔍 开始告警检测...");
  
  const rules = await getActiveRules();
  
  for (const rule of rules) {
    try {
      switch (rule.metric_type) {
        case "tvl_drop":
          await checkTvlDrop(rule);
          break;
        case "apr_change":
          await checkAprSpike(rule);
          break;
        case "unrealized_pnl_pct":
          await checkPositionLoss(rule);
          break;
        case "tvl_usd":
          await checkLiquidityDrain(rule);
          break;
        case "health_score":
          await checkTvlDrop(rule); // 复用健康分检测
          break;
      }
    } catch (err) {
      console.error(`❌ 规则 ${rule.rule_id} 检测失败: ${(err as Error).message}`);
    }
  }
  
  console.log("✅ 告警检测完成");
}

// 获取最近告警
export async function getRecentAlerts(limit = 20): Promise<AlertEvent[]> {
  const result = await pool.query(
    `SELECT * FROM alert_events ORDER BY triggered_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// 确认告警
export async function acknowledgeAlert(eventId: string, userId: string): Promise<void> {
  await pool.query(
    `UPDATE alert_events SET status = 'acknowledged', acknowledged_at = NOW(), acknowledged_by = $2 WHERE event_id = $1`,
    [eventId, userId]
  );
}

// 解决告警
export async function resolveAlert(eventId: string): Promise<void> {
  await pool.query(
    `UPDATE alert_events SET status = 'resolved', resolved_at = NOW() WHERE event_id = $1`,
    [eventId]
  );
}

// 导出单独运行（ESM 兼容）
const _fn = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === _fn;
if (isMain) {
  runAlertCheck()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
