-- 单池健康分：为 pools 表增加 health_score 列（已有表时执行）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pools' AND column_name = 'health_score'
  ) THEN
    ALTER TABLE pools ADD COLUMN health_score NUMERIC(5, 2);
    CREATE INDEX idx_pools_health ON pools(health_score DESC);
  END IF;
END $$;
