-- 启用行级安全策略 (RLS)
-- 保护用户数据隐私，确保用户只能访问自己的数据

-- 1. 启用 RLS
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_balances ENABLE ROW LEVEL SECURITY;

-- 2. 创建策略函数
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS TEXT AS $$
  SELECT current_setting('request.jwt.claims', true)::json->>'sub';
$$ LANGUAGE sql STABLE;

-- 3. positions 表策略
CREATE POLICY "用户只能查看自己的持仓"
  ON positions FOR SELECT
  USING (wallet_address = current_user OR wallet_address = auth.uid());

CREATE POLICY "用户只能插入自己的持仓"
  ON positions FOR INSERT
  WITH CHECK (wallet_address = current_user OR wallet_address = auth.uid());

CREATE POLICY "用户只能更新自己的持仓"
  ON positions FOR UPDATE
  USING (wallet_address = current_user OR wallet_address = auth.uid());

-- 4. transactions 表策略
CREATE POLICY "用户只能查看自己的交易"
  ON transactions FOR SELECT
  USING (wallet_address = current_user OR wallet_address = auth.uid());

CREATE POLICY "用户只能插入自己的交易"
  ON transactions FOR INSERT
  WITH CHECK (wallet_address = current_user OR wallet_address = auth.uid());

-- 5. pending_signatures 表策略
CREATE POLICY "用户只能查看自己的签名请求"
  ON pending_signatures FOR SELECT
  USING (payload->>'from' = current_user OR payload->>'from' = auth.uid());

CREATE POLICY "用户只能插入自己的签名请求"
  ON pending_signatures FOR INSERT
  WITH CHECK (payload->>'from' = current_user OR payload->>'from' = auth.uid());

-- 6. wallet_balances 表策略
CREATE POLICY "用户只能查看自己的钱包余额"
  ON wallet_balances FOR SELECT
  USING (wallet_address = current_user OR wallet_address = auth.uid());

CREATE POLICY "用户只能更新自己的钱包余额"
  ON wallet_balances FOR UPDATE
  USING (wallet_address = current_user OR wallet_address = auth.uid());

-- 7. 为现有用户创建角色（如果需要）
-- 注意：在应用层面通过 JWT 设置 current_user
