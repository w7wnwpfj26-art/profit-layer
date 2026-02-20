# 系统架构文档

## 整体架构

```
┌─ Scanner ──────── DefiLlama API ──── TimescaleDB ─┐
│   (Node.js)       每5分钟扫描                        │
│                   计算健康分                          │
│                                                     │
├─ AI Engine ─────── DeepSeek LLM ── BullMQ ─────────┤
│   (Python/FastAPI) 策略优化                           │
│                    风险评分                           │
│                    信号审批                           │
│                                                     │
├─ Executor ──────── 协议适配器 ──── 多链 RPC ────────┤
│   (Node.js)        Uniswap/Aave/Thala               │
│                    交易模拟+执行                      │
│                                                     │
├─ Dashboard ─────── Next.js 16 ── Cyber-Glass UI ───┤
│   (React)          API 路由层                        │
│                    WebSocket (规划中)                 │
│                                                     │
└─ Desktop ──────── Electron ── 自动更新 ─────────────┘
```

## 数据流

1. **Scanner** → DefiLlama API → `pools` 表 (含 health_score)
2. **Strategy Worker** → 读取 pools → 数学模型初筛 → DeepSeek AI 审批 → 信号
3. **Executor** → 接收信号 → 模拟交易 → 执行交易 → 记录 `transactions`
4. **Dashboard** → 读取所有表 → 实时展示 → 用户操作 → 写回配置

## AI Agent 依赖的数据库表

AI 引擎的思考循环、记忆与决策反馈依赖以下表，**已包含在 `infra/postgres/init.sql`** 中，全新部署无需额外操作：

| 表名 | 用途 |
|------|------|
| `ai_think_log` | 每次思考循环的输入/输出摘要与完整 JSON，供仪表盘「AI 大脑思考日志」展示 |
| `ai_memory` | 历史分析与决策摘要，供下次思考时注入 prompt |
| `ai_decisions` | 决策记录与事后评估（actual_apr、actual_outcome），用于准确率统计 |

若数据库是在加入上述表结构之前创建的，需手动执行迁移：  
`infra/postgres/migrations/004_ai_agent_tables.sql`。

## 技术栈
- **前端**: Next.js 16 + Tailwind CSS + Recharts + Lucide Icons
- **后端 (TS)**: Node.js + BullMQ + viem + @solana/web3.js
- **后端 (Python)**: FastAPI + numpy + scipy + aiohttp
- **数据库**: TimescaleDB (PostgreSQL) + Redis
- **AI**: DeepSeek V3/R1 (可切换 GPT-4o)
- **桌面端**: Electron + electron-updater
