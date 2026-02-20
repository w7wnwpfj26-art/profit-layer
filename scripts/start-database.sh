#!/bin/bash
# DeFi 數據庫啟動與驗證腳本
# 用途：啟動 TimescaleDB 並驗證 Dashboard 連接

set -e

# 顏色輸出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 項目根目錄
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ===== 函數定義 =====
log_info() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[!]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[→]${NC} $1"
}

# 檢查 Docker 是否運行
check_docker() {
    if ! docker info &> /dev/null; then
        log_error "Docker 未運行，請先啟動 Docker Desktop"
        exit 1
    fi
    log_info "Docker 運行正常"
}

# 加載環境變量
load_env() {
    if [ -f "$PROJECT_ROOT/.env" ]; then
        source "$PROJECT_ROOT/.env"
        log_info "已加載 .env 配置"
    else
        log_warn ".env 文件不存在，使用默認配置"
        # 設置默認值
        POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
        POSTGRES_PORT="${POSTGRES_PORT:-5433}"
        POSTGRES_DB="${POSTGRES_DB:-defi_yield}"
        POSTGRES_USER="${POSTGRES_USER:-defi}"
        POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-change_me_in_production}"
    fi
    
    echo ""
    echo "數據庫配置："
    echo "  主機: $POSTGRES_HOST"
    echo "  端口: $POSTGRES_PORT"
    echo "  數據庫: $POSTGRES_DB"
    echo "  用戶: $POSTGRES_USER"
    echo ""
}

# 啟動數據庫
start_database() {
    log_step "啟動 TimescaleDB..."
    
    cd "$PROJECT_ROOT"
    docker compose up -d timescaledb
    
    log_info "TimescaleDB 容器已啟動"
}

# 等待數據庫就緒
wait_for_db() {
    log_step "等待數據庫就緒..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker compose exec -T timescaledb pg_isready -U "$POSTGRES_USER" &> /dev/null; then
            log_info "數據庫已就緒（耗時 ${attempt} 秒）"
            return 0
        fi
        
        echo -n "."
        sleep 1
        attempt=$((attempt + 1))
    done
    
    echo ""
    log_error "數據庫啟動超時（${max_attempts}秒）"
    return 1
}

# 驗證數據庫連接
verify_connection() {
    log_step "驗證數據庫連接..."
    
    # 測試連接
    if docker compose exec -T timescaledb psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1" &> /dev/null; then
        log_info "數據庫連接成功"
    else
        log_error "數據庫連接失敗"
        return 1
    fi
    
    # 檢查表是否存在
    local table_count=$(docker compose exec -T timescaledb psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'")
    table_count=$(echo $table_count | xargs) # 去除空白
    
    if [ "$table_count" -gt 0 ]; then
        log_info "數據庫已初始化（共 $table_count 張表）"
    else
        log_warn "數據庫尚未初始化，表數量為 0"
    fi
}

# 測試本地連接（從 Dashboard 的角度）
test_local_connection() {
    log_step "測試本地連接（端口 $POSTGRES_PORT）..."
    
    # 嘗試用 psql 連接（如果系統安裝了）
    if command -v psql &> /dev/null; then
        if PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1" &> /dev/null; then
            log_info "本地連接測試成功（Dashboard 應該能連接）"
        else
            log_warn "本地連接測試失敗（但容器內部正常）"
            log_warn "這可能是端口映射問題，請檢查 docker-compose.yml"
        fi
    else
        log_warn "系統未安裝 psql，跳過本地連接測試"
        log_info "如需測試本地連接，請安裝 PostgreSQL 客戶端"
    fi
}

# 顯示容器狀態
show_status() {
    log_step "容器狀態："
    echo ""
    docker compose ps timescaledb redis grafana 2>/dev/null || docker compose ps timescaledb
    echo ""
}

# 顯示日誌
show_logs() {
    if [ "$1" = "--logs" ]; then
        echo ""
        log_step "顯示最近 20 行日誌："
        echo "----------------------------------------"
        docker compose logs --tail=20 timescaledb
        echo "----------------------------------------"
    fi
}

# 顯示連接信息
show_connection_info() {
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║          數據庫已就緒 - 連接信息                          ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "容器內部連接："
    echo "  psql -h timescaledb -U $POSTGRES_USER -d $POSTGRES_DB"
    echo ""
    echo "本地連接（Dashboard 使用）："
    echo "  Host: $POSTGRES_HOST"
    echo "  Port: $POSTGRES_PORT"
    echo "  Database: $POSTGRES_DB"
    echo "  User: $POSTGRES_USER"
    echo "  Password: $POSTGRES_PASSWORD"
    echo ""
    echo "連接字符串："
    echo "  postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@$POSTGRES_HOST:$POSTGRES_PORT/$POSTGRES_DB"
    echo ""
    echo -e "${BLUE}下一步操作：${NC}"
    echo "  1. 啟動 Dashboard："
    echo "     cd packages/dashboard && pnpm dev"
    echo ""
    echo "  2. 訪問："
    echo "     http://localhost:${DASHBOARD_PORT:-3002}"
    echo ""
    echo "  3. 查看數據庫日誌："
    echo "     docker compose logs -f timescaledb"
    echo ""
    echo "  4. 進入數據庫命令行："
    echo "     docker compose exec timescaledb psql -U $POSTGRES_USER -d $POSTGRES_DB"
    echo ""
}

# 可選：啟動其他服務
start_optional_services() {
    if [ "$1" = "--all" ]; then
        log_step "啟動所有基礎服務（Redis, Grafana）..."
        docker compose up -d timescaledb redis grafana
        log_info "所有基礎服務已啟動"
    fi
}

# ===== 主流程 =====
main() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║         DeFi 數據庫啟動與驗證腳本                        ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # 1. 檢查 Docker
    check_docker
    
    # 2. 加載環境變量
    load_env
    
    # 3. 啟動數據庫
    start_database
    
    # 4. 啟動可選服務
    start_optional_services "$1"
    
    # 5. 等待就緒
    wait_for_db
    
    # 6. 驗證連接
    verify_connection
    
    # 7. 測試本地連接
    test_local_connection
    
    # 8. 顯示狀態
    show_status
    
    # 9. 顯示日誌（可選）
    show_logs "$1"
    
    # 10. 顯示連接信息
    show_connection_info
    
    echo -e "${GREEN}✓ 數據庫啟動完成！${NC}"
    echo ""
}

# 使用說明
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "用法: $0 [OPTIONS]"
    echo ""
    echo "選項："
    echo "  (無參數)    僅啟動 TimescaleDB"
    echo "  --all       啟動 TimescaleDB + Redis + Grafana"
    echo "  --logs      顯示數據庫日誌"
    echo "  --help      顯示此幫助信息"
    echo ""
    echo "示例："
    echo "  $0              # 僅啟動數據庫"
    echo "  $0 --all        # 啟動所有服務"
    echo "  $0 --logs       # 啟動並顯示日誌"
    echo ""
    exit 0
fi

# 執行主流程
main "$@"
