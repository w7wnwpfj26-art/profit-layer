<div align="center">

# ProfitLayer

**AI 驱动的多链 DeFi 自动化收益优化系统**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.11%2B-blue.svg)](https://python.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://typescriptlang.org/)

[English](./README.md) · [中文](./README.zh-CN.md) · [快速开始](./docs/快速开始.md) · [API 文档](./docs/API.md) · [架构设计](./docs/ARCHITECTURE.md) · [路线图](./docs/ROADMAP.md)

</div>

---

ProfitLayer 扫描 10+ 条链上的 200+ DeFi 协议，通过 AI 模型进行风险评分与组合优化，自动执行收益策略 — 全部通过专业级 Dashboard 管理，支持 Google Authenticator 二次验证。

> **当前状态：Research Preview / Beta**
> 本项目仅供研究与教育用途。系统已集成完整的风控机制，但真实资金部署需谨慎操作。不构成任何投资建议。

## 核心差异化

大多数开源 DeFi 工具只解决单一环节。ProfitLayer 将它们组合成一个完整可运行的系统：

| 能力维度 | Hummingbot / Freqtrade | Yearn / Beefy | ProfitLayer |
|---|---|---|---|
| 多链执行 | 偏 CEX | 单链 Vault | 10+ 链 (EVM + Aptos + Solana) |
| AI 策略引擎 | 规则驱动 | 固定 Vault 逻辑 | ML 风险评分 + 组合优化 |
| 专业控制台 | CLI / 简易 UI | 纯链上 | 完整 Web UI + 桌面客户端 |
| 风控体系 | 基础止损 | 协议级 | 多层防护（异常检测、熔断开关、敞口限制） |
| 自托管 | ✅ | ❌（协议） | ✅ |

## 界面预览

<div align="center">
<img src="./pools_screenshot.png" width="32%" alt="池子发现" />
<img src="./positions_page_screenshot.png" width="32%" alt="持仓管理" />
<img src="./wallet_screenshot.png" width="32%" alt="钱包概览" />
</div>

## 系统架构

```
┌─ Scanner ──────── DefiLlama API ──── TimescaleDB ─┐
│   池子扫描器        协议数据采集       时序数据库     │
│                                                     │
├─ AI Engine ─────── 收益预测器 ─────── BullMQ ──────┤
│   (Python/FastAPI)  风险评分器                       │
│                     组合优化器                       │
│                     异常检测器                       │
│                                                     │
├─ Executor ──────── 协议适配器 ─────── 多链 ────────┤
│   (TypeScript)      Uniswap V3, Aave V3            │
│                     Curve, Lido, Compound V3        │
│                     Thala (Aptos)                    │
│                     Raydium, Marinade (Solana)       │
│                                                     │
├─ Dashboard ─────── Next.js 16 Web UI ──────────────┤
│                     JWT + TOTP 二次验证              │
│                     实时监控面板                      │
│                                                     │
└─ Desktop ──────── Electron 桌面端 (Win/Mac) ───────┘
```

## 快速开始

### 环境要求

- Node.js 20+, pnpm 9+
- Docker（用于 PostgreSQL/TimescaleDB + Redis）
- Python 3.11+（AI 引擎，可选）

### 1. 克隆与配置

```bash
git clone https://github.com/user/profit-layer.git
cd profit-layer
cp .env.example .env   # 编辑填入你的密钥
```

### 2. 启动基础设施

```bash
bash scripts/start-database.sh --all   # TimescaleDB + Redis
```

### 3. 运行 Dashboard

```bash
pnpm install
pnpm dashboard        # http://localhost:3002
```

### 4. （可选）启动 AI 引擎

```bash
cd ai-engine
pip install -r requirements.txt
uvicorn src.api.main:app --port 8000
```

详细步骤请查看 [快速开始文档](./docs/快速开始.md)。

## 项目结构

```
profit-layer/
├── packages/
│   ├── common/          # 共享类型、数据库、Redis、配置
│   ├── scanner/         # DefiLlama 池子扫描服务
│   ├── adapters/        # 协议适配器 (Uniswap, Aave, Thala 等)
│   ├── executor/        # 多链交易执行引擎
│   ├── dashboard/       # Next.js Web 控制台
│   └── desktop/         # Electron 桌面应用
├── ai-engine/           # Python AI 引擎 (FastAPI)
│   ├── src/models/      # 收益预测、风险评分、无常损失计算
│   ├── src/strategies/  # 组合优化、收益农场、套利
│   └── src/risk/        # 敞口管理、异常检测
├── infra/               # Docker 配置 (PostgreSQL, Redis, Grafana)
├── docs/                # 文档
└── docker-compose.yml   # 全服务编排
```

## 支持的链

| 链 | 类型 | 协议 |
|----|------|------|
| Ethereum | EVM | Uniswap V3, Aave V3, Curve, Lido, Compound V3 |
| Arbitrum | EVM | Uniswap V3, Aave V3, Curve, Compound V3 |
| Polygon | EVM | Uniswap V3, Aave V3, Curve, Compound V3 |
| Base | EVM | Uniswap V3, Aave V3, Compound V3 |
| Optimism | EVM | Uniswap V3, Aave V3 |
| Avalanche | EVM | Aave V3 |
| BSC | EVM | 通过 DefiLlama |
| Aptos | Move | Thala Finance |
| Solana | SVM | Raydium, Marinade Finance |

## 策略类型

- **收益农场 (Yield Farming)** — AI 优化的 LP 挖矿，基于夏普比率分配
- **借贷套利 (Lending Arbitrage)** — 跨借贷协议利率差套利
- **跨 DEX 套利 (Cross-DEX Arbitrage)** — 跨交易所价差检测
- **流动性质押 (Liquid Staking)** — 通过 LST 协议自动质押
- **自动复投 (Auto-Compound)** — 自动收割并再投资收益

## 安全特性

- JWT 认证 + Google Authenticator (TOTP) 二次验证
- AES-256 加密密钥存储
- 交易执行前模拟验证
- 单笔与每日支出限额
- 紧急熔断开关（一键停止）
- 止损与追踪止损监控
- 异常检测（Rug Pull、TVL 暴跌）
- 完整审计日志 + Telegram 告警

## 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | Node.js 20+, Python 3.11+ |
| 语言 | TypeScript 5, Python |
| 前端 | Next.js 16, React 19, TailwindCSS 4, Recharts |
| 桌面端 | Electron + electron-builder |
| 数据库 | TimescaleDB (PostgreSQL + 时序扩展) |
| 队列 | Redis 7+ / BullMQ |
| 区块链 | viem, @aptos-labs/ts-sdk, @solana/web3.js |
| AI/ML | FastAPI, scikit-learn, pandas, numpy |
| 基础设施 | Docker Compose, Grafana |
| 构建 | pnpm workspaces, Turbo |

## AI 引擎 API

| 端点 | 说明 |
|------|------|
| `GET /health` | 系统健康检查 |
| `POST /risk/assess` | 池子风险评估 |
| `POST /risk/il-calculate` | 无常损失计算 |
| `POST /strategy/optimize` | 组合优化 |
| `POST /strategy/analyze` | 策略信号生成 |
| `GET /exposure` | 当前敞口报告 |

## 参与贡献

请查看 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解贡献指南。

## 许可证

[MIT](./LICENSE) — Copyright (c) 2026 Wang Qi

## 免责声明

本项目涉及 DeFi 自动化策略，**仅供研究与教育用途**，不构成任何投资建议。用户需自行承担与 DeFi 交互相关的所有风险。建议始终使用模拟模式 (Dry Run) 并从小额开始。

---

<div align="center">

**[完整文档](./docs/)** · **[提交 Bug](https://github.com/user/profit-layer/issues)** · **[路线图](./docs/ROADMAP.md)**

</div>
