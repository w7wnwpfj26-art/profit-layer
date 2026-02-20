#!/bin/bash

echo "=== Dashboard 启动诊断 ==="

echo "1. 检查端口占用..."
lsof -i :3002 2>/dev/null || echo "端口 3002 未被占用"

echo "2. 检查 Node.js 版本..."
node --version 2>/dev/null || echo "Node.js 未安装或不可用"

echo "3. 检查 pnpm..."
pnpm --version 2>/dev/null || echo "pnpm 未安装或不可用"

echo "4. 检查工作目录..."
pwd

echo "5. 检查 package.json..."
ls -la package.json 2>/dev/null || echo "package.json 不存在"

echo "6. 检查 node_modules..."
ls -la node_modules/.bin/next 2>/dev/null || echo "Next.js 未安装"

echo "7. 尝试编译..."
npx tsc --noEmit 2>&1 | head -10

echo "8. 尝试启动..."
timeout 10s npx next dev -p 3002 2>&1 | head -20
