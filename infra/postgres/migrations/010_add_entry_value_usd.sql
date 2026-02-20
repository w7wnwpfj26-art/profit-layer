-- 添加 entry_value_usd 列到 positions 表
-- 用于记录持仓的入场价值，以便准确计算 PnL

ALTER TABLE positions ADD COLUMN IF NOT EXISTS entry_value_usd NUMERIC DEFAULT 0;

-- 为现有记录设置 entry_value_usd = value_usd（假设当前价值就是入场价值）
UPDATE positions
SET entry_value_usd = value_usd
WHERE entry_value_usd IS NULL OR entry_value_usd = 0;

-- 添加注释
COMMENT ON COLUMN positions.entry_value_usd IS '持仓入场时的美元价值';
