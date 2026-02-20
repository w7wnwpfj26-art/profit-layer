#!/bin/bash
# 數據庫快速檢查腳本
# 用途：檢查數據庫表結構和數據

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║               數據庫快速檢查                              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 加載環境變量
if [ -f "$PROJECT_ROOT/.env" ]; then
    source "$PROJECT_ROOT/.env"
fi

POSTGRES_USER="${POSTGRES_USER:-defi}"
POSTGRES_DB="${POSTGRES_DB:-defi_yield}"

cd "$PROJECT_ROOT"

echo -e "${GREEN}[1] 檢查表列表：${NC}"
echo "----------------------------------------"
docker compose exec -T timescaledb psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt"
echo ""

echo -e "${GREEN}[2] 檢查 chains 表：${NC}"
echo "----------------------------------------"
docker compose exec -T timescaledb psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT chain_id, name, chain_type, is_active FROM chains ORDER BY id;"
echo ""

echo -e "${GREEN}[3] 檢查 pools 表（前 10 條）：${NC}"
echo "----------------------------------------"
docker compose exec -T timescaledb psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT COUNT(*) as total_pools FROM pools;"
docker compose exec -T timescaledb psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT pool_id, protocol_id, chain_id, symbol, apr_total, tvl_usd FROM pools LIMIT 10;"
echo ""

echo -e "${GREEN}[4] 檢查 protocols 表：${NC}"
echo "----------------------------------------"
docker compose exec -T timescaledb psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT COUNT(*) as total_protocols FROM protocols;"
docker compose exec -T timescaledb psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT protocol_id, name, category, chain_id FROM protocols LIMIT 10;"
echo ""

echo -e "${GREEN}[5] 檢查 system_config 表：${NC}"
echo "----------------------------------------"
docker compose exec -T timescaledb psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT key, value, category FROM system_config ORDER BY category, key;"
echo ""

echo -e "${YELLOW}提示：${NC}"
echo "  • 如果 pools 和 protocols 表為空，需要運行 scanner 來填充數據"
echo "  • 可以運行 'pnpm seed' 來生成模擬數據進行測試"
echo ""
