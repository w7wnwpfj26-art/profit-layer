-- ============================================
-- 005: Add position_pnl_snapshots table
-- 用于记录投资组合净值和盈亏的时间序列数据
-- ============================================

-- 创建 position_pnl_snapshots 表
CREATE TABLE IF NOT EXISTS position_pnl_snapshots (
    time TIMESTAMPTZ NOT NULL,
    total_value_usd NUMERIC(20, 2) DEFAULT 0,
    total_pnl_usd NUMERIC(20, 2) DEFAULT 0,
    positions_count INTEGER DEFAULT 0
);

-- 转换为 TimescaleDB hypertable（如果使用 TimescaleDB）
SELECT create_hypertable('position_pnl_snapshots', 'time', if_not_exists => TRUE);

-- 创建索引以提升查询性能
CREATE INDEX IF NOT EXISTS idx_position_pnl_snapshots_time 
    ON position_pnl_snapshots(time DESC);
