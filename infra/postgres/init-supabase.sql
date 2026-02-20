-- ============================================
-- Nexus Yield Agent - Supabase Database Init
-- ============================================
-- 适用于 Supabase (标准 PostgreSQL)
-- 移除了 TimescaleDB 扩展依赖

-- ---- Chains ----
CREATE TABLE IF NOT EXISTS chains (
    id SERIAL PRIMARY KEY,
    chain_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    chain_type VARCHAR(20) NOT NULL,
    native_token VARCHAR(20) NOT NULL,
    rpc_url TEXT,
    explorer_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---- Protocols ----
CREATE TABLE IF NOT EXISTS protocols (
    id SERIAL PRIMARY KEY,
    protocol_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(50) NOT NULL,
    chain_id VARCHAR(50) NOT NULL REFERENCES chains(chain_id),
    website_url TEXT,
    logo_url TEXT,
    tvl_usd NUMERIC(20, 2) DEFAULT 0,
    risk_score NUMERIC(5, 2),
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---- Pools ----
CREATE TABLE IF NOT EXISTS pools (
    id SERIAL PRIMARY KEY,
    pool_id VARCHAR(200) UNIQUE NOT NULL,
    protocol_id VARCHAR(100) NOT NULL REFERENCES protocols(protocol_id),
    chain_id VARCHAR(50) NOT NULL REFERENCES chains(chain_id),
    symbol VARCHAR(200) NOT NULL,
    tokens JSONB NOT NULL DEFAULT '[]',
    pool_type VARCHAR(50),
    tvl_usd NUMERIC(20, 2) DEFAULT 0,
    apr_base NUMERIC(10, 4) DEFAULT 0,
    apr_reward NUMERIC(10, 4) DEFAULT 0,
    apr_total NUMERIC(10, 4) DEFAULT 0,
    volume_24h_usd NUMERIC(20, 2) DEFAULT 0,
    fee_tier NUMERIC(10, 6),
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    health_score NUMERIC(5, 2),
    last_scanned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pools_protocol ON pools(protocol_id);
CREATE INDEX IF NOT EXISTS idx_pools_chain ON pools(chain_id);
CREATE INDEX IF NOT EXISTS idx_pools_apr ON pools(apr_total DESC);
CREATE INDEX IF NOT EXISTS idx_pools_tvl ON pools(tvl_usd DESC);
CREATE INDEX IF NOT EXISTS idx_pools_health ON pools(health_score DESC);

-- ---- Pool History (普通表，非 hypertable) ----
CREATE TABLE IF NOT EXISTS pool_snapshots (
    id SERIAL PRIMARY KEY,
    time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    pool_id VARCHAR(200) NOT NULL,
    tvl_usd NUMERIC(20, 2),
    apr_base NUMERIC(10, 4),
    apr_reward NUMERIC(10, 4),
    apr_total NUMERIC(10, 4),
    volume_24h_usd NUMERIC(20, 2),
    price_token0 NUMERIC(30, 10),
    price_token1 NUMERIC(30, 10)
);
CREATE INDEX IF NOT EXISTS idx_pool_snapshots_pool ON pool_snapshots(pool_id, time DESC);

-- ---- Positions ----
CREATE TABLE IF NOT EXISTS positions (
    id SERIAL PRIMARY KEY,
    position_id VARCHAR(200) UNIQUE NOT NULL,
    pool_id VARCHAR(200) NOT NULL REFERENCES pools(pool_id),
    wallet_address VARCHAR(200) NOT NULL,
    chain_id VARCHAR(50) NOT NULL REFERENCES chains(chain_id),
    strategy_id VARCHAR(100),
    amount_token0 NUMERIC(30, 10) DEFAULT 0,
    amount_token1 NUMERIC(30, 10) DEFAULT 0,
    value_usd NUMERIC(20, 2) DEFAULT 0,
    entry_price_token0 NUMERIC(30, 10),
    entry_price_token1 NUMERIC(30, 10),
    unrealized_pnl_usd NUMERIC(20, 2) DEFAULT 0,
    realized_pnl_usd NUMERIC(20, 2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_positions_wallet ON positions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);

-- ---- Transactions ----
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    tx_hash VARCHAR(200) NOT NULL,
    chain_id VARCHAR(50) NOT NULL REFERENCES chains(chain_id),
    protocol_id VARCHAR(100) REFERENCES protocols(protocol_id),
    pool_id VARCHAR(200),
    position_id VARCHAR(200),
    wallet_address VARCHAR(200) NOT NULL,
    tx_type VARCHAR(50) NOT NULL,
    amount_usd NUMERIC(20, 2),
    gas_cost_usd NUMERIC(10, 4),
    status VARCHAR(20) DEFAULT 'pending',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_transactions_time ON transactions(created_at DESC);

-- ---- Strategies ----
CREATE TABLE IF NOT EXISTS strategies (
    id SERIAL PRIMARY KEY,
    strategy_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    strategy_type VARCHAR(50) NOT NULL,
    description TEXT,
    config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT false,
    total_allocated_usd NUMERIC(20, 2) DEFAULT 0,
    total_pnl_usd NUMERIC(20, 2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---- Strategy Performance (普通表) ----
CREATE TABLE IF NOT EXISTS strategy_snapshots (
    id SERIAL PRIMARY KEY,
    time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    strategy_id VARCHAR(100) NOT NULL,
    allocated_usd NUMERIC(20, 2),
    pnl_usd NUMERIC(20, 2),
    apr_realized NUMERIC(10, 4),
    risk_score NUMERIC(5, 2),
    positions_count INTEGER DEFAULT 0
);

-- ---- Audit Log ----
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) DEFAULT 'info',
    source VARCHAR(100),
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_time ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_severity ON audit_log(severity);

-- ---- Pending Signatures ----
CREATE TABLE IF NOT EXISTS pending_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chain_id VARCHAR(50) NOT NULL,
    tx_type VARCHAR(50) NOT NULL,
    amount_usd NUMERIC(20, 2),
    payload JSONB NOT NULL,
    signature TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---- Users (含 2FA 支持) ----
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(256) NOT NULL,
    salt VARCHAR(64) NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    is_active BOOLEAN DEFAULT true,
    totp_secret VARCHAR(64),
    totp_enabled BOOLEAN DEFAULT false,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---- System Config ----
CREATE TABLE IF NOT EXISTS system_config (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    category VARCHAR(50) DEFAULT 'general',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---- AI Agent Tables ----
CREATE TABLE IF NOT EXISTS ai_think_log (
    id SERIAL PRIMARY KEY,
    cycle_id VARCHAR(100) UNIQUE NOT NULL,
    input_summary TEXT,
    output_summary TEXT,
    full_input JSONB DEFAULT '{}',
    full_output JSONB DEFAULT '{}',
    tokens_used INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    actions_taken INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_think_log_created_at ON ai_think_log(created_at DESC);

CREATE TABLE IF NOT EXISTS ai_memory (
    id SERIAL PRIMARY KEY,
    memory_type VARCHAR(50) NOT NULL,
    summary TEXT NOT NULL,
    content JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_memory_created_at ON ai_memory(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_memory_type ON ai_memory(memory_type);

CREATE TABLE IF NOT EXISTS ai_decisions (
    id SERIAL PRIMARY KEY,
    decision_type VARCHAR(50) NOT NULL,
    pool_id VARCHAR(200) NOT NULL,
    symbol VARCHAR(200) NOT NULL,
    chain VARCHAR(50) NOT NULL,
    expected_apr NUMERIC(10, 4) NOT NULL,
    confidence NUMERIC(5, 4) NOT NULL,
    reasoning TEXT,
    actual_outcome VARCHAR(20) DEFAULT 'pending',
    actual_apr NUMERIC(10, 4),
    evaluated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_created_at ON ai_decisions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_actual_outcome ON ai_decisions(actual_outcome);

-- ---- Seed: System Config ----
INSERT INTO system_config (key, value, description, category) VALUES
    ('autopilot_enabled', 'false', '全自动交易开关', 'autopilot'),
    ('autopilot_dry_run', 'true', '模拟模式（true=不执行真实交易）', 'autopilot'),
    ('total_capital_usd', '10000', '总投资金额（美元）', 'autopilot'),
    ('kill_switch', 'false', '紧急停止开关', 'risk'),
    ('max_single_tx_usd', '10000', '单笔交易上限（美元）', 'risk'),
    ('max_daily_tx_usd', '50000', '每日交易上限（美元）', 'risk'),
    ('stop_loss_pct', '10', '止损比例（%）', 'risk'),
    ('max_risk_score', '60', '最大风险评分（0-100）', 'risk'),
    ('scan_interval_min', '5', '池子扫描间隔（分钟）', 'scanner'),
    ('min_tvl_usd', '100000', '最低追踪锁仓量（美元）', 'scanner'),
    ('min_apr_pct', '1', '最低追踪年化率（%）', 'scanner'),
    ('compound_interval_hr', '6', '自动复投间隔（小时）', 'scanner'),
    ('evm_wallet_address', '', 'EVM 钱包地址', 'wallet'),
    ('aptos_wallet_address', '', 'Aptos 钱包地址', 'wallet'),
    ('solana_wallet_address', '', 'Solana 钱包地址', 'wallet'),
    ('telegram_bot_token', '', 'Telegram Bot Token', 'notification'),
    ('telegram_chat_id', '', 'Telegram Chat ID', 'notification'),
    ('alert_webhook_url', '', 'Webhook 告警地址', 'notification'),
    ('min_health_score', '60', '选池最低健康分', 'strategy'),
    ('rebalance_threshold_pct', '20', '再平衡偏差阈值(%)', 'strategy'),
    ('deepseek_api_key', '', 'DeepSeek API Key', 'ai'),
    ('zhipu_api_key', '', '智谱 AI API Key', 'ai'),
    ('ai_model', 'deepseek-chat', 'AI 模型选择', 'ai'),
    ('ai_base_url', 'https://api.deepseek.com', 'AI API 基础地址', 'ai'),
    ('ai_auto_approve', 'false', 'AI 自动审批', 'ai')
ON CONFLICT (key) DO NOTHING;

-- ---- Seed: Strategies ----
INSERT INTO strategies (strategy_id, name, strategy_type, description, config, is_active) VALUES
    ('yield_farming_v1', '流动性挖矿优化器', 'yield_farming',
     'AI 优化的多链流动性挖矿策略，使用夏普比率进行资金分配，扣除交易磨损后计算净收益。',
     '{"min_apr": 5, "max_risk_score": 60, "compound_interval_ms": 21600000}', false),
    ('lending_arb_v1', '借贷套利', 'lending_arb',
     '利用不同借贷协议之间的利率差进行套利（Aave、Compound 等），监控清算风险。',
     '{"min_spread_pct": 1.5, "max_ltv": 0.65}', false),
    ('staking_v1', '流动性质押 + 再质押', 'staking',
     '通过 Lido/EigenLayer 等质押原生代币，叠加再质押收益，低风险稳定回报。',
     '{"protocols": ["lido", "eigenlayer", "marinade"]}', false),
    ('funding_rate_arb', '资金费率套利', 'funding_rate_arb',
     'Delta 中性策略：做多现货 + 做空永续合约，收取资金费率，与市场涨跌无关。',
     '{"min_funding_rate": 0.01, "hedge_ratio": 1.0}', false),
    ('rwa_yield', 'RWA 国债收益', 'rwa',
     '配置链上代币化美国国债（sDAI/USDY），4-5% 低风险保底收益，作为投资组合安全垫。',
     '{"target_allocation_pct": 20}', false),
    ('cross_dex_arb', '跨 DEX 套利', 'cross_dex_arb',
     '检测不同 DEX 之间的价格差异并通过 DEX 聚合器执行盈利交易。',
     '{"min_profit_usd": 5, "max_slippage_pct": 0.5}', false)
ON CONFLICT (strategy_id) DO NOTHING;

-- ---- Seed: Chains ----
INSERT INTO chains (chain_id, name, chain_type, native_token, explorer_url) VALUES
    ('ethereum', 'Ethereum', 'evm', 'ETH', 'https://etherscan.io'),
    ('arbitrum', 'Arbitrum One', 'evm', 'ETH', 'https://arbiscan.io'),
    ('bsc', 'BNB Smart Chain', 'evm', 'BNB', 'https://bscscan.com'),
    ('polygon', 'Polygon', 'evm', 'POL', 'https://polygonscan.com'),
    ('base', 'Base', 'evm', 'ETH', 'https://basescan.org'),
    ('optimism', 'Optimism', 'evm', 'ETH', 'https://optimistic.etherscan.io'),
    ('avalanche', 'Avalanche C-Chain', 'evm', 'AVAX', 'https://snowtrace.io'),
    ('aptos', 'Aptos', 'aptos', 'APT', 'https://explorer.aptoslabs.com'),
    ('solana', 'Solana', 'solana', 'SOL', 'https://solscan.io')
ON CONFLICT (chain_id) DO NOTHING;
