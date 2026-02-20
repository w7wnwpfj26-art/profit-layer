-- 009: 告警规则 + 告警事件表
-- alert_rules: 定义告警触发条件
CREATE TABLE IF NOT EXISTS alert_rules (
    rule_id       VARCHAR(64) PRIMARY KEY,
    name          VARCHAR(128) NOT NULL,
    metric_type   VARCHAR(64) NOT NULL,   -- tvl_drop, apr_change, unrealized_pnl_pct, tvl_usd, health_score
    condition     VARCHAR(16) NOT NULL DEFAULT '<',  -- <, >, <=, >=
    threshold     NUMERIC NOT NULL,
    time_window_minutes INTEGER DEFAULT 60,
    severity      VARCHAR(16) NOT NULL DEFAULT 'warning',  -- info, warning, critical
    channels      JSONB DEFAULT '["dashboard"]',
    cooldown_minutes INTEGER DEFAULT 30,
    enabled       BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- alert_events: 实际触发的告警记录
CREATE TABLE IF NOT EXISTS alert_events (
    event_id        VARCHAR(64) PRIMARY KEY,
    rule_id         VARCHAR(64) REFERENCES alert_rules(rule_id),
    pool_id         VARCHAR(128),
    chain_id        VARCHAR(32),
    protocol_id     VARCHAR(128),
    metric_value    NUMERIC,
    threshold_value NUMERIC,
    severity        VARCHAR(16) NOT NULL DEFAULT 'warning',
    status          VARCHAR(16) NOT NULL DEFAULT 'triggered',  -- triggered, acknowledged, resolved
    message         TEXT,
    metadata        JSONB DEFAULT '{}',
    triggered_at    TIMESTAMPTZ DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by VARCHAR(64),
    resolved_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alert_events_status ON alert_events(status);
CREATE INDEX IF NOT EXISTS idx_alert_events_triggered ON alert_events(triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_events_severity ON alert_events(severity);

-- 种子数据: 默认告警规则
INSERT INTO alert_rules (rule_id, name, metric_type, condition, threshold, severity, cooldown_minutes) VALUES
  ('health-score-low',    '健康分过低',       'health_score',        '<', 20,     'warning',  30),
  ('apr-spike',           'APR 异常飙升',     'apr_change',          '>', 10000,  'warning',  60),
  ('position-loss-5pct',  '持仓亏损超 5%',    'unrealized_pnl_pct',  '<', -5,     'warning',  60),
  ('position-loss-10pct', '持仓亏损超 10%',   'unrealized_pnl_pct',  '<', -10,    'critical', 30),
  ('tvl-drain',           '池子 TVL 枯竭',    'tvl_usd',             '<', 50000,  'critical', 60),
  ('tvl-drop-sudden',     'TVL 突然下降',     'tvl_drop',            '<', -30,    'critical', 30)
ON CONFLICT (rule_id) DO NOTHING;
