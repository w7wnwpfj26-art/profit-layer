-- 日限额持久化配置
-- 用于记录执行器的每日支出限额状态，防止进程重启后归零

INSERT INTO system_config (key, value, description, category)
VALUES 
  ('daily_spent_usd', '0', '当日已支出 USD', 'risk'),
  ('daily_reset_time', '0', '日限额重置时间戳', 'risk')
ON CONFLICT (key) DO NOTHING;
