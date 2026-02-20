# Dashboard 启动问题诊断报告

## 问题现象
访问 http://localhost:3002/wallet 返回 500 错误

## 已修复的问题
✅ Middleware 导出名错误（从 rateLimitMiddleware 改为 middleware）
✅ 移除了缺失的 @upstash/ratelimit 和 @upstash/redis 依赖
✅ 简化了限流逻辑，使用本地内存实现

## 当前状态
服务无法启动，命令执行无输出

## 可能的原因
1. 系统资源限制（文件描述符、内存）
2. Node.js/pnpm 环境问题
3. 端口被系统策略阻止
4. 终端/Shell 配置问题

## 建议的解决方案

### 方案一：使用 Docker（推荐）
```bash
cd /Users/wangqi/Documents/ai/dapp
docker-compose up -d dashboard
```

### 方案二：检查系统环境
```bash
# 检查 Node.js
node --version
npm --version

# 检查 pnpm
pnpm --version

# 检查端口
lsof -i :3002

# 检查资源限制
ulimit -a
```

### 方案三：手动启动测试
```bash
# 1. 清理缓存
cd /Users/wangqi/Documents/ai/dapp/packages/dashboard
rm -rf .next node_modules/.cache

# 2. 重新安装依赖
pnpm install --force

# 3. 启动服务
DEBUG=* pnpm dev
```

### 方案四：使用备用端口
```bash
cd /Users/wangqi/Documents/ai/dapp/packages/dashboard
PORT=3003 pnpm dev
```

## 临时访问方式
如果急需访问钱包功能，可以：
1. 使用已部署的在线版本（如果有）
2. 检查是否有其他开发者的本地实例
3. 使用简化版的静态页面进行测试
