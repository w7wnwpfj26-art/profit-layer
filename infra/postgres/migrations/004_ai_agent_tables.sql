-- AI Agent 相关表：思考日志、记忆、决策反馈
-- 与 ai-engine 的 think_loop.py / memory.py 及 Dashboard think-log API 一致

-- ---- ai_think_log: 思考循环每次运行的结果 ----
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

-- ---- ai_memory: AI 记忆（历史分析与决策摘要） ----
CREATE TABLE IF NOT EXISTS ai_memory (
    id SERIAL PRIMARY KEY,
    memory_type VARCHAR(50) NOT NULL,
    summary TEXT NOT NULL,
    content JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_memory_created_at ON ai_memory(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_memory_type ON ai_memory(memory_type);

-- ---- ai_decisions: 决策记录与反馈评估 ----
CREATE TABLE IF NOT EXISTS ai_decisions (
    id SERIAL PRIMARY KEY,
    decision_type VARCHAR(50) NOT NULL,
    pool_id VARCHAR(200) NOT NULL,
    symbol VARCHAR(200) NOT NULL,
    chain VARCHAR(50) NOT NULL,
    expected_apr NUMERIC(10, 4) NOT NULL,
    confidence NUMERIC(5, 4) NOT NULL,
    reasoning TEXT,
    actual_outcome VARCHAR(20) DEFAULT 'pending',  -- 'pending' | 'profit' | 'loss' | 'neutral'
    actual_apr NUMERIC(10, 4),
    evaluated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_decisions_created_at ON ai_decisions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_actual_outcome ON ai_decisions(actual_outcome);
