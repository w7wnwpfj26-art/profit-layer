#!/bin/bash
# DeFi 桌面應用更新部署腳本
# 用途：打包應用並上傳到更新服務器

set -e

# ===== 配置區（部署時請改為你自己的服務器）=====
SERVER_USER="root"
SERVER_HOST="YOUR_UPDATE_SERVER"
SERVER_PORT="22"
UPDATE_DIR="/var/www/updates"
LOCAL_DIST="packages/desktop/dist"

# 顏色輸出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ===== 函數定義 =====
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_dist_files() {
    if [ ! -d "$LOCAL_DIST" ]; then
        log_error "打包目錄不存在: $LOCAL_DIST"
        log_info "請先執行: cd packages/desktop && npm run build"
        exit 1
    fi
    
    local has_files=false
    if ls "$LOCAL_DIST"/*.yml >/dev/null 2>&1 || \
       ls "$LOCAL_DIST"/*.exe >/dev/null 2>&1 || \
       ls "$LOCAL_DIST"/*.dmg >/dev/null 2>&1; then
        has_files=true
    fi
    
    if [ "$has_files" = false ]; then
        log_error "沒有找到打包文件（.yml/.exe/.dmg）"
        log_info "請先執行: cd packages/desktop && npm run build"
        exit 1
    fi
}

# ===== 主流程 =====
main() {
    log_info "=== DeFi 桌面應用更新部署 ==="
    echo ""
    
    # 1. 檢查本地打包文件
    log_info "步驟 1/4: 檢查本地打包文件..."
    check_dist_files
    log_info "✓ 找到打包文件"
    echo ""
    
    # 2. 顯示將要上傳的文件
    log_info "步驟 2/4: 將要上傳的文件："
    echo "----------------------------------------"
    ls -lh "$LOCAL_DIST"/*.{yml,exe,dmg} 2>/dev/null | awk '{print "  " $9, "(" $5 ")"}'
    echo "----------------------------------------"
    echo ""
    
    # 3. 確認上傳
    read -p "$(echo -e ${YELLOW}是否繼續上傳到 ${SERVER_HOST}:${UPDATE_DIR}? [y/N]${NC} )" -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_warn "已取消部署"
        exit 0
    fi
    
    # 4. 上傳文件
    log_info "步驟 3/4: 上傳文件到服務器..."
    
    # 先創建遠程目錄（如果不存在）
    ssh -p "$SERVER_PORT" "${SERVER_USER}@${SERVER_HOST}" "mkdir -p ${UPDATE_DIR}" || {
        log_error "無法連接到服務器或創建目錄"
        exit 1
    }
    
    # 上傳所有更新文件
    scp -P "$SERVER_PORT" \
        "$LOCAL_DIST"/*.yml \
        "$LOCAL_DIST"/*.exe \
        "$LOCAL_DIST"/*.dmg \
        "${SERVER_USER}@${SERVER_HOST}:${UPDATE_DIR}/" 2>/dev/null || {
        log_warn "部分文件上傳失敗（可能某些平台未打包）"
    }
    
    log_info "✓ 文件上傳完成"
    echo ""
    
    # 5. 驗證
    log_info "步驟 4/4: 驗證遠程文件..."
    ssh -p "$SERVER_PORT" "${SERVER_USER}@${SERVER_HOST}" "ls -lh ${UPDATE_DIR}/" || {
        log_error "無法驗證遠程文件"
        exit 1
    }
    echo ""
    
    # 6. 完成
    log_info "=== 部署成功 ==="
    echo ""
    echo -e "${GREEN}更新地址: https://${SERVER_HOST}/updates${NC}"
    echo ""
    echo "客戶端將在 1 小時內檢測到更新（或啟動後 5 秒）"
    echo "可以手動測試更新 URL:"
    echo "  curl -I https://${SERVER_HOST}/updates/latest.yml"
    echo ""
}

# 執行主流程
main
