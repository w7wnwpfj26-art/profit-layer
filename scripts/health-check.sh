#!/bin/bash

# ProfitLayer 健康检查脚本
# 检查各组件运行状态，异常时发送告警

set -euo pipefail

# 配置
LOG_FILE="/tmp/defi-health-check.log"
ALERT_THRESHOLD=3  # 连续失败次数触发告警
WEBHOOK_URL="${HEALTH_CHECK_WEBHOOK:-}"  # Discord/Webhook URL

# 状态跟踪
declare -A FAIL_COUNT

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

alert() {
    local component="$1"
    local message="$2"
    
    log "🚨 [告警] $component: $message"
    
    # 发送到 webhook（如果配置了）
    if [[ -n "$WEBHOOK_URL" ]]; then
        curl -s -X POST "$WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{\"content\": \"🚨 **$component 告警**: $message\"}" \
            >/dev/null 2>&1 || true
    fi
    
    # 重启服务（可选）
    case "$component" in
        "dashboard")
            pm2 restart defi-dashboard 2>/dev/null || systemctl restart defi-dashboard 2>/dev/null || true
            ;;
        "ai-engine")
            pm2 restart ai-engine 2>/dev/null || systemctl restart ai-engine 2>/dev/null || true
            ;;
        "scanner")
            pm2 restart scanner 2>/dev/null || systemctl restart scanner 2>/dev/null || true
            ;;
    esac
}

# 检查 Dashboard 服务
check_dashboard() {
    local port="${DASHBOARD_PORT:-3002}"
    if curl -s --max-time 10 "http://localhost:$port/api/health" >/dev/null 2>&1; then
        FAIL_COUNT["dashboard"]=0
        log "✅ Dashboard 正常运行"
        return 0
    else
        ((FAIL_COUNT["dashboard"]++))
        if [[ ${FAIL_COUNT["dashboard"]} -ge $ALERT_THRESHOLD ]]; then
            alert "dashboard" "服务无响应 (端口 $port)"
        fi
        return 1
    fi
}

# 检查 AI Engine
check_ai_engine() {
    local port="${AI_ENGINE_PORT:-8000}"
    if curl -s --max-time 10 "http://localhost:$port/health" >/dev/null 2>&1; then
        FAIL_COUNT["ai-engine"]=0
        log "✅ AI Engine 正常运行"
        return 0
    else
        ((FAIL_COUNT["ai-engine"]++))
        if [[ ${FAIL_COUNT["ai-engine"]} -ge $ALERT_THRESHOLD ]]; then
            alert "ai-engine" "服务无响应 (端口 $port)"
        fi
        return 1
    fi
}

# 检查数据库连接
check_database() {
    # 从环境变量读取配置
    local host="${POSTGRES_HOST:-localhost}"
    local port="${POSTGRES_PORT:-5432}"
    local db="${POSTGRES_DB:-postgres}"
    local user="${POSTGRES_USER:-postgres}"
    
    if pg_isready -h "$host" -p "$port" -U "$user" >/dev/null 2>&1; then
        FAIL_COUNT["database"]=0
        log "✅ 数据库连接正常"
        return 0
    else
        ((FAIL_COUNT["database"]++))
        if [[ ${FAIL_COUNT["database"]} -ge $ALERT_THRESHOLD ]]; then
            alert "database" "无法连接到 $host:$port"
        fi
        return 1
    fi
}

# 检查 Redis
check_redis() {
    local host="${REDIS_HOST:-localhost}"
    local port="${REDIS_PORT:-6379}"
    
    if redis-cli -h "$host" -p "$port" ping >/dev/null 2>&1; then
        FAIL_COUNT["redis"]=0
        log "✅ Redis 连接正常"
        return 0
    else
        ((FAIL_COUNT["redis"]++))
        if [[ ${FAIL_COUNT["redis"]} -ge $ALERT_THRESHOLD ]]; then
            alert "redis" "无法连接到 $host:$port"
        fi
        return 1
    fi
}

# 检查磁盘空间
check_disk_space() {
    local threshold=90  # 90% 使用率告警
    local usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    
    if [[ $usage -lt $threshold ]]; then
        log "✅ 磁盘空间充足 (${usage}%)"
        return 0
    else
        alert "disk" "磁盘使用率过高 (${usage}%)"
        return 1
    fi
}

# 检查内存使用
check_memory() {
    local threshold=85  # 85% 使用率告警
    local usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    
    if [[ $usage -lt $threshold ]]; then
        log "✅ 内存使用正常 (${usage}%)"
        return 0
    else
        alert "memory" "内存使用率过高 (${usage}%)"
        return 1
    fi
}

# 检查 CPU 使用
check_cpu() {
    local threshold=80  # 80% 使用率告警
    local usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1 | cut -d'u' -f1)
    
    if (( $(echo "$usage < $threshold" | bc -l) )); then
        log "✅ CPU 使用正常 (${usage}%)"
        return 0
    else
        alert "cpu" "CPU 使用率过高 (${usage}%)"
        return 1
    fi
}

# 主检查循环
main() {
    log "🔍 开始健康检查..."
    
    local failed=0
    
    check_dashboard || ((failed++))
    check_ai_engine || ((failed++))
    check_database || ((failed++))
    check_redis || ((failed++))
    check_disk_space || ((failed++))
    check_memory || ((failed++))
    check_cpu || ((failed++))
    
    if [[ $failed -eq 0 ]]; then
        log "🎉 所有服务正常"
    else
        log "⚠️  $failed 个检查项失败"
        exit 1
    fi
}

# 设置定时任务 (crontab)
setup_cron() {
    local script_path="$(realpath "$0")"
    local cron_job="*/5 * * * * $script_path >> $LOG_FILE 2>&1"
    
    # 检查是否已存在
    if crontab -l 2>/dev/null | grep -F "$script_path" >/dev/null; then
        echo "✅ Cron 任务已存在"
    else
        (crontab -l 2>/dev/null; echo "$cron_job") | crontab -
        echo "✅ Cron 任务已添加 (每5分钟执行)"
    fi
}

# 命令行参数
case "${1:-}" in
    "cron")
        setup_cron
        ;;
    "once")
        main
        ;;
    *)
        echo "用法:"
        echo "  $0 once     # 执行一次检查"
        echo "  $0 cron     # 添加到 crontab (每5分钟)"
        echo ""
        echo "环境变量:"
        echo "  HEALTH_CHECK_WEBHOOK  # 告警 Webhook URL"
        echo "  DASHBOARD_PORT        # Dashboard 端口 (默认 3002)"
        echo "  AI_ENGINE_PORT        # AI Engine 端口 (默认 8000)"
        ;;
esac
