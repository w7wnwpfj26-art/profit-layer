-- 005_pool_snapshots.sql
-- 池子快照时序表，供回测系统使用

-- 向已有的 pool_snapshots 表添加缺失列（如需要）
ALTER TABLE pool_snapshots ADD COLUMN IF NOT EXISTS protocol_id TEXT DEFAULT '';
ALTER TABLE pool_snapshots ADD COLUMN IF NOT EXISTS chain_id TEXT DEFAULT '';
ALTER TABLE pool_snapshots ADD COLUMN IF NOT EXISTS symbol TEXT DEFAULT '';
ALTER TABLE pool_snapshots ADD COLUMN IF NOT EXISTS health_score NUMERIC(6,2) DEFAULT 50;

-- 索引
CREATE INDEX IF NOT EXISTS idx_pool_snapshots_pool_time ON pool_snapshots (pool_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_pool_snapshots_time ON pool_snapshots (time DESC);

-- 自动快照触发器：每次 pools 表更新时自动写入快照（含新列）
CREATE OR REPLACE FUNCTION fn_pool_snapshot()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO pool_snapshots (time, pool_id, protocol_id, chain_id, symbol, apr_total, tvl_usd, health_score)
    VALUES (NOW(), NEW.pool_id, NEW.protocol_id, NEW.chain_id, NEW.symbol, NEW.apr_total, NEW.tvl_usd, COALESCE(NEW.health_score, 50));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 仅在触发器不存在时创建
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pool_snapshot') THEN
        CREATE TRIGGER trg_pool_snapshot
        AFTER INSERT OR UPDATE OF apr_total, tvl_usd ON pools
        FOR EACH ROW
        EXECUTE FUNCTION fn_pool_snapshot();
    END IF;
END $$;
