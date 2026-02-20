-- 失败交易分析脚本
-- 用法: docker exec defi-timescaledb psql -U defi -d defi_yield -f - < scripts/analyze-failed-tx.sql

-- 1. 按 failureReason 聚合（新版本会记录）
SELECT
  COALESCE(metadata->>'failureReason', 'unknown') AS failure_reason,
  metadata->>'error' AS error_sample,
  COUNT(*) AS count
FROM transactions
WHERE status = 'failed' AND metadata IS NOT NULL
GROUP BY metadata->>'failureReason', metadata->>'error'
ORDER BY count DESC
LIMIT 30;

-- 2. 按 action 聚合（用于推断失败阶段）
SELECT
  metadata->>'action' AS action,
  chain_id,
  tx_type,
  COUNT(*) AS count
FROM transactions
WHERE status = 'failed'
GROUP BY metadata->>'action', chain_id, tx_type
ORDER BY count DESC
LIMIT 20;

-- 3. 最近失败交易详情（含 error）
SELECT id, tx_hash, tx_type, chain_id, amount_usd, status,
  metadata->>'error' AS error,
  metadata->>'failureReason' AS failure_reason,
  metadata->>'action' AS action,
  created_at
FROM transactions
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 20;
