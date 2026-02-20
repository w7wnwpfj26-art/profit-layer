-- 补充 strategies 种子数据（已有则跳过）
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
