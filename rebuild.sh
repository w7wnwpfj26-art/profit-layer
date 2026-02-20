#!/bin/bash
set -e

echo ""
echo "============================================"
echo "  Nexus Yield Agent - 一键重建"
echo "============================================"
echo ""

cd "$(dirname "$0")"
echo "● 工作目录: $(pwd)"
echo ""

# 1. 停止旧容器
echo "▶ [1/4] 停止旧容器..."
docker compose down 2>/dev/null || true
echo "  ✓ 已停止"
echo ""

# 2. 重新构建
echo "▶ [2/4] 重新构建所有服务（需要几分钟）..."
docker compose build --no-cache 2>&1 | tail -5
echo "  ✓ 构建完成"
echo ""

# 3. 启动
echo "▶ [3/4] 启动所有服务..."
docker compose up -d
echo "  ✓ 已启动"
echo ""

# 4. 等待健康检查
echo "▶ [4/4] 等待数据库就绪..."
for i in $(seq 1 30); do
  if docker compose exec -T timescaledb pg_isready -U defi >/dev/null 2>&1; then
    echo "  ✓ 数据库已就绪"
    break
  fi
  sleep 2
  printf "  等待中... %ds\r" $((i*2))
done
echo ""

# 5. 显示状态
echo "============================================"
echo "  容器状态："
echo "============================================"
docker ps --format "table {{.Names}}\t{{.Status}}" | grep defi
echo ""
echo "============================================"
echo "  ✅ 全部完成！"
echo ""
echo "  打开浏览器访问: http://localhost:3002"
echo "============================================"
echo ""

# 6. 可选：推送到你配置的 Git 远程（请勿在脚本中写密码，使用 SSH 或 credential helper）
# git add -A && git commit -m "your message" && git push origin main
echo ""
echo "按回车键关闭..."
read
