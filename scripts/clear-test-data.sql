-- 清空测试/假数据（交易记录 + 持仓）
-- 使用: psql -h localhost -p 5433 -U defi -d defi_yield -f scripts/clear-test-data.sql
-- 或 Docker: docker exec -i defi-timescaledb psql -U defi defi_yield < scripts/clear-test-data.sql

BEGIN;
DELETE FROM transactions;
DELETE FROM positions;
COMMIT;
