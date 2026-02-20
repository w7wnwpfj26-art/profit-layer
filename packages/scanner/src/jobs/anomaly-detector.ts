// 异常交易检测服务
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

interface AnomalyRule {
  rule_id: string;
  name: string;
  rule_type: string;
  condition: Record<string, unknown>;
  severity: string;
  auto_action: string;
}

interface AnomalyEvent {
  event_id: string;
  rule_id: string;
  tx_hash?: string;
  wallet_address?: string;
  pool_id?: string;
  chain_id?: string;
  detected_value: Record<string, unknown>;
  severity: string;
  action_taken?: string;
}

// 获取启用的异常规则
async function getActiveRules(): Promise<AnomalyRule[]> {
  const result = await pool.query(
    "SELECT * FROM anomaly_rules WHERE enabled = true"
  );
  return result.rows.map((r: Record<string, unknown>) => ({
    ...r,
    condition: typeof r.condition === "string" ? JSON.parse(r.condition as string) : r.condition,
  }));
}

// 记录异常事件
async function recordAnomalyEvent(event: AnomalyEvent): Promise<void> {
  await pool.query(
    `INSERT INTO anomaly_events (event_id, rule_id, tx_hash, wallet_address, pool_id, chain_id, detected_value, severity, action_taken)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      event.event_id,
      event.rule_id,
      event.tx_hash,
      event.wallet_address,
      event.pool_id,
      event.chain_id,
      JSON.stringify(event.detected_value),
      event.severity,
      event.action_taken,
    ]
  );
  console.log(`🚨 异常检测: [${event.severity.toUpperCase()}] ${event.rule_id}`);
}

// 检测大额提现
async function checkLargeWithdrawals(rule: AnomalyRule): Promise<void> {
  const threshold = (rule.condition.threshold_usd as number) || 10000;
  
  const result = await pool.query(`
    SELECT tx_hash, wallet_address, chain_id, pool_id, amount_usd, created_at
    FROM transactions
    WHERE tx_type IN ('exit', 'withdraw')
    AND amount_usd > $1
    AND created_at > NOW() - INTERVAL '10 minutes'
    AND tx_hash NOT IN (SELECT tx_hash FROM anomaly_events WHERE tx_hash IS NOT NULL)
  `, [threshold]);

  for (const row of result.rows) {
    const event: AnomalyEvent = {
      event_id: uuid(),
      rule_id: rule.rule_id,
      tx_hash: row.tx_hash,
      wallet_address: row.wallet_address,
      pool_id: row.pool_id,
      chain_id: row.chain_id,
      detected_value: { amount_usd: row.amount_usd },
      severity: rule.severity,
      action_taken: rule.auto_action,
    };
    await recordAnomalyEvent(event);
  }
}

// 检测高频交易
async function checkRapidTrades(rule: AnomalyRule): Promise<void> {
  const windowMinutes = (rule.condition.window_minutes as number) || 5;
  const maxCount = (rule.condition.max_count as number) || 10;

  const result = await pool.query(`
    SELECT wallet_address, COUNT(*) as tx_count
    FROM transactions
    WHERE created_at > NOW() - INTERVAL '${windowMinutes} minutes'
    GROUP BY wallet_address
    HAVING COUNT(*) > $1
  `, [maxCount]);

  for (const row of result.rows) {
    // 检查是否已记录
    const existing = await pool.query(
      `SELECT 1 FROM anomaly_events WHERE rule_id = $1 AND wallet_address = $2 AND detected_at > NOW() - INTERVAL '30 minutes'`,
      [rule.rule_id, row.wallet_address]
    );
    if (existing.rows.length > 0) continue;

    const event: AnomalyEvent = {
      event_id: uuid(),
      rule_id: rule.rule_id,
      wallet_address: row.wallet_address,
      detected_value: { tx_count: row.tx_count, window_minutes: windowMinutes },
      severity: rule.severity,
      action_taken: rule.auto_action,
    };
    await recordAnomalyEvent(event);
  }
}

// 检测巨鲸异动
async function checkWhaleMovement(rule: AnomalyRule): Promise<void> {
  const tvlPctThreshold = (rule.condition.tvl_pct_threshold as number) || 20;

  // 查找 TVL 占比高的持仓
  const result = await pool.query(`
    SELECT p.wallet_address, p.pool_id, p.value_usd, pools.tvl_usd,
           (p.value_usd / NULLIF(pools.tvl_usd, 0) * 100) as tvl_pct
    FROM positions p
    JOIN pools ON p.pool_id = pools.pool_id
    WHERE p.status = 'active'
    AND (p.value_usd / NULLIF(pools.tvl_usd, 0) * 100) > $1
  `, [tvlPctThreshold]);

  for (const row of result.rows) {
    // 检查该钱包是否有最近的大额操作
    const recentTx = await pool.query(`
      SELECT tx_hash, tx_type, amount_usd FROM transactions
      WHERE wallet_address = $1 AND created_at > NOW() - INTERVAL '1 hour'
      AND amount_usd > 1000
      ORDER BY created_at DESC LIMIT 1
    `, [row.wallet_address]);

    if (recentTx.rows.length === 0) continue;

    const tx = recentTx.rows[0];
    const event: AnomalyEvent = {
      event_id: uuid(),
      rule_id: rule.rule_id,
      tx_hash: tx.tx_hash,
      wallet_address: row.wallet_address,
      pool_id: row.pool_id,
      detected_value: {
        tvl_pct: row.tvl_pct,
        position_value_usd: row.value_usd,
        pool_tvl_usd: row.tvl_usd,
        recent_tx_type: tx.tx_type,
        recent_tx_amount: tx.amount_usd,
      },
      severity: rule.severity,
      action_taken: rule.auto_action,
    };
    await recordAnomalyEvent(event);
  }
}

// 主检测循环
export async function runAnomalyCheck(): Promise<void> {
  console.log("🔍 开始异常交易检测...");

  const rules = await getActiveRules();

  for (const rule of rules) {
    try {
      switch (rule.rule_type) {
        case "volume":
          await checkLargeWithdrawals(rule);
          break;
        case "frequency":
          await checkRapidTrades(rule);
          break;
        case "whale":
          await checkWhaleMovement(rule);
          break;
        // pattern 类型需要更复杂的链上分析，暂不实现
      }
    } catch (err) {
      console.error(`❌ 规则 ${rule.rule_id} 检测失败: ${(err as Error).message}`);
    }
  }

  console.log("✅ 异常交易检测完成");
}

// 获取最近异常事件
export async function getRecentAnomalies(limit = 20): Promise<AnomalyEvent[]> {
  const result = await pool.query(
    `SELECT e.*, r.name as rule_name
     FROM anomaly_events e
     LEFT JOIN anomaly_rules r ON e.rule_id = r.rule_id
     ORDER BY e.detected_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// 导出单独运行（ESM 兼容）
const _fn = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === _fn;
if (isMain) {
  runAnomalyCheck()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
