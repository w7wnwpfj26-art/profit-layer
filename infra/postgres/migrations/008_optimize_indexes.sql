-- 数据库查询性能优化索引
-- 提升高频查询速度，降低响应时间

-- 1. positions 表索引
-- 按钱包地址和状态查询（持仓页面主要查询）
CREATE INDEX IF NOT EXISTS idx_positions_wallet_status 
ON positions (wallet_address, status) 
WHERE status = 'active';

-- 按策略ID查询
CREATE INDEX IF NOT EXISTS idx_positions_strategy 
ON positions (strategy_id) 
WHERE strategy_id IS NOT NULL;

-- 按链ID查询
CREATE INDEX IF NOT EXISTS idx_positions_chain 
ON positions (chain_id);

-- 按时间排序
CREATE INDEX IF NOT EXISTS idx_positions_updated_at 
ON positions (updated_at DESC);

-- 2. transactions 表索引
-- 按钱包地址查询最近交易
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_created 
ON transactions (wallet_address, created_at DESC);

-- 按链和协议查询
CREATE INDEX IF NOT EXISTS idx_transactions_chain_protocol 
ON transactions (chain_id, protocol_id);

-- 按状态查询
CREATE INDEX IF NOT EXISTS idx_transactions_status 
ON transactions (status);

-- 3. pending_signatures 表索引
-- 按状态查询待处理签名
CREATE INDEX IF NOT EXISTS idx_pending_signatures_status 
ON pending_signatures (status) 
WHERE status = 'pending';

-- 按创建时间排序
CREATE INDEX IF NOT EXISTS idx_pending_signatures_created 
ON pending_signatures (created_at);

-- 按链ID查询
CREATE INDEX IF NOT EXISTS idx_pending_signatures_chain 
ON pending_signatures (chain_id);

-- 4. wallet_balances 表索引
-- 按钱包地址查询
CREATE INDEX IF NOT EXISTS idx_wallet_balances_address 
ON wallet_balances (wallet_address);

-- 按链ID查询
CREATE INDEX IF NOT EXISTS idx_wallet_balances_chain 
ON wallet_balances (chain_id);

-- 5. pools 表索引
-- 按协议和链查询
CREATE INDEX IF NOT EXISTS idx_pools_protocol_chain 
ON pools (protocol_id, chain_id);

-- 按TVL排序
CREATE INDEX IF NOT EXISTS idx_pools_tvl 
ON pools (tvl_usd DESC);

-- 按APR排序
CREATE INDEX IF NOT EXISTS idx_pools_apr 
ON pools (apr_total DESC);

-- 6. strategies 表索引
-- 按状态查询
CREATE INDEX IF NOT EXISTS idx_strategies_status 
ON strategies (status) 
WHERE status = 'active';

-- 7. 统计信息更新（帮助查询优化器）
ANALYZE positions;
ANALYZE transactions;
ANALYZE pending_signatures;
ANALYZE wallet_balances;
ANALYZE pools;
ANALYZE strategies;
