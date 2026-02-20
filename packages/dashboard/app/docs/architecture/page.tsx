"use client";

import React from "react";
import { Layers, Database, Cpu, Zap, Network, Server, Cloud, Lock } from "lucide-react";

export default function ArchitecturePage() {
  return (
    <div className="space-y-8 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* 页头 */}
      <div className="glass-hover glass p-12 rounded-[3.5rem] border border-white/5 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-16 opacity-[0.03] pointer-events-none group-hover:scale-110 transition-transform duration-1000">
          <Layers className="w-72 h-72 text-accent" />
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-[24px] bg-accent/20 flex items-center justify-center border border-accent/30 shadow-lg shadow-accent/10">
              <Layers className="w-8 h-8 text-accent" />
            </div>
            <div>
              <h1 className="text-5xl font-black text-white tracking-tight">系统架构</h1>
              <p className="text-muted-strong text-sm font-bold uppercase tracking-[0.2em] mt-2">四层架构 · 事件驱动 · 微服务</p>
            </div>
          </div>
        </div>
      </div>

      {/* 架构总览 */}
      <Section icon={<Layers className="w-6 h-6" />} title="架构总览">
        <div className="glass p-10 rounded-[3rem] border border-white/5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { layer: "展示层", name: "Dashboard", tech: "Next.js 16 + Turbopack", icon: <Cloud className="w-6 h-6" />, color: "accent" },
              { layer: "执行层", name: "Executor", tech: "Node.js + Ethers.js", icon: <Zap className="w-6 h-6" />, color: "success" },
              { layer: "AI 层", name: "AI Engine", tech: "Python + FastAPI", icon: <Cpu className="w-6 h-6" />, color: "warning" },
              { layer: "数据层", name: "Database", tech: "TimescaleDB + Redis", icon: <Database className="w-6 h-6" />, color: "info" }
            ].map((item, i) => (
              <div key={i} className="glass-hover p-8 rounded-[24px] border border-white/5 flex flex-col items-center text-center group">
                <div className={`w-16 h-16 rounded-2xl bg-${item.color}/20 flex items-center justify-center border border-${item.color}/30 mb-4 group-hover:scale-110 transition-transform`}>
                  <div className={`text-${item.color}`}>{item.icon}</div>
                </div>
                <span className="text-[10px] font-black text-muted-strong uppercase tracking-[0.3em] mb-2">{item.layer}</span>
                <h3 className="text-xl font-black text-white mb-2">{item.name}</h3>
                <p className="text-xs text-muted">{item.tech}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* 数据流图 */}
      <Section icon={<Network className="w-6 h-6" />} title="数据流动">
        <div className="glass p-10 rounded-[3rem] border border-white/5 overflow-x-auto">
          <pre className="text-xs text-muted font-mono leading-loose">
{`┌─────────────────────────────────────────────────────────────────────────────────┐
│                                  Dashboard (Next.js)                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   首页      │  │  资产池      │  │   钱包      │  │  设置 & Ops & 文档      │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └────────┬────────────────┘ │
│         │                │                │                    │                  │
└─────────┼────────────────┼────────────────┼────────────────────┼──────────────────┘
          │                │                │                    │
          ▼                ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            API Routes (/api/*)                                    │
│  • /api/pools - 池子数据                • /api/positions - 持仓数据             │
│  • /api/sentiment - 市场情绪            • /api/alpha - Alpha 信号              │
│  • /api/ai/* - AI 相关接口              • /api/ops - 运营监控                   │
└─────────┬───────────────────────────────────────────────────────┬───────────────┘
          │                                                       │
          ▼ (直接查询)                                            ▼ (转发到 AI Engine)
┌─────────────────────────────┐                     ┌─────────────────────────────┐
│   TimescaleDB (PostgreSQL)   │                     │    AI Engine (Python)       │
│  ┌─────────────────────────┐ │                     │  ┌────────────────────────┐ │
│  │ pools, positions        │ │                     │  │ Market Sentiment       │ │
│  │ pool_snapshots          │ │◄────────────────────┼──│ Alpha Scanner          │ │
│  │ system_config           │ │                     │  │ AI Advisor             │ │
│  │ ai_memory, ai_decisions │ │                     │  │ Think Loop             │ │
│  │ ai_think_log            │ │                     │  └────────────────────────┘ │
│  └─────────────────────────┘ │                     │          │                  │
└──────────────▲────────────────┘                     └──────────┼──────────────────┘
               │                                                 │
               │                                                 ▼
               │                                    ┌────────────────────────────┐
               │                                    │    外部 APIs               │
               │                                    │  • DeepSeek / OpenAI       │
               │                                    │  • CoinGecko               │
               │                                    │  • Fear & Greed Index      │
               │                                    └────────────────────────────┘
               │
┌──────────────┴──────────────┐         ┌────────────────────────────────────────┐
│  Strategy Worker (Python)    │         │          Redis (消息队列)               │
│  • 策略信号生成              │────────►│  • 交易信号队列                         │
│  • 池子评分                  │         │  • 缓存层                               │
└──────────────────────────────┘         └──────────┬─────────────────────────────┘
                                                    │
                                                    ▼
                                          ┌──────────────────────────────┐
                                          │   Executor (Node.js)         │
                                          │  • 信号消费                   │
                                          │  • 交易执行                   │
                                          │  • 链上交互                   │
                                          └──────────┬───────────────────┘
                                                     │
                                                     ▼
                                          ┌──────────────────────────────┐
                                          │   Scanner (Node.js)          │
                                          │  • 链上数据扫描               │
                                          │  • TVL 更新                  │
                                          │  • 池子发现                   │
                                          └──────────────────────────────┘`}
          </pre>
        </div>
      </Section>

      {/* 核心模块详解 */}
      <Section icon={<Server className="w-6 h-6" />} title="核心模块详解">
        <div className="space-y-6">
          {/* Dashboard */}
          <ModuleCard
            title="Dashboard (展示层)"
            icon={<Cloud className="w-6 h-6 text-accent" />}
            tech="Next.js 16.1.6, React 19, Turbopack, TailwindCSS"
            port="3002"
            features={[
              "实时资产概览 - 多链钱包余额、持仓 PnL、收益统计",
              "池子探索 - 按链/协议筛选、健康分排序、AI 评级",
              "AI 大脑可视化 - 市场情绪、Alpha 信号、思考日志",
              "运营监控 - 系统状态、数据源健康度、业务指标",
              "Premium UI - Glassmorphism 设计、流畅动画、响应式布局"
            ]}
          />

          {/* AI Engine */}
          <ModuleCard
            title="AI Engine (AI 层)"
            icon={<Cpu className="w-6 h-6 text-warning" />}
            tech="Python 3.11, FastAPI, scikit-learn, pandas"
            port="8000"
            features={[
              "市场情绪感知 - 恐惧贪婪指数、BTC/ETH 价格、Gas 监控",
              "Alpha 信号扫描 - TVL 动量、新池发现、鲸鱼活动检测",
              "AI 策略顾问 - LLM 驱动的决策建议 (DeepSeek / OpenAI / 规则引擎)",
              "记忆系统 - 持久化历史分析,跨轮次上下文",
              "决策反馈闭环 - 准确率统计、事后评估",
              "自主思考循环 - 每小时自动执行「收集→分析→决策→写回」"
            ]}
          />

          {/* Executor */}
          <ModuleCard
            title="Executor (执行层)"
            icon={<Zap className="w-6 h-6 text-success" />}
            tech="Node.js, Ethers.js, viem"
            port="-"
            features={[
              "信号消费 - 从 Redis 队列拉取交易信号",
              "交易执行 - 多链 swap、入池、出池、收益收割",
              "Gas 优化 - 动态 Gas 估算、MEV 保护",
              "错误处理 - 自动重试、失败回滚、日志记录",
              "安全机制 - 滑点控制、交易上限、白名单协议"
            ]}
          />

          {/* Scanner */}
          <ModuleCard
            title="Scanner (数据采集层)"
            icon={<Network className="w-6 h-6 text-info" />}
            tech="Node.js, DefiLlama API, RPC"
            port="-"
            features={[
              "池子扫描 - 定时从 DefiLlama 拉取最新池子数据",
              "TVL 更新 - 写入 pool_snapshots 时序表",
              "链上查询 - 用户余额、持仓、交易历史",
              "多链支持 - Ethereum, Arbitrum, Base, BSC, Polygon"
            ]}
          />

          {/* Strategy Worker */}
          <ModuleCard
            title="Strategy Worker (策略层)"
            icon={<Database className="w-6 h-6 text-purple-400" />}
            tech="Python, APScheduler"
            port="-"
            features={[
              "策略引擎 - 健康分阈值、风险分上限、激进/保守模式",
              "池子评分 - 综合 APR、TVL、协议、链、历史表现",
              "信号生成 - enter_pool, add_position, exit_pool, rebalance",
              "AI 审批 - 可选的 AI 单次信号审批",
              "信号推送 - 推送到 Redis 队列供 Executor 消费"
            ]}
          />

          {/* Database */}
          <ModuleCard
            title="Database (数据层)"
            icon={<Database className="w-6 h-6 text-accent" />}
            tech="TimescaleDB (PostgreSQL 16) + Redis 7"
            port="5432, 6379"
            features={[
              "时序数据 - pool_snapshots (hypertable) 存储历史 TVL/APR",
              "实时数据 - pools, positions, transactions",
              "AI 数据 - ai_memory, ai_decisions, ai_think_log",
              "配置数据 - system_config (参数热更新)",
              "缓存层 - Redis 缓存钱包余额、池子数据",
              "消息队列 - Redis List 实现信号队列"
            ]}
          />
        </div>
      </Section>

      {/* 技术选型 */}
      <Section icon={<Lock className="w-6 h-6" />} title="技术选型理由">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            {
              tech: "Next.js 16 + Turbopack",
              reason: "极速热更新 (Turbopack 比 Webpack 快 10x)、服务端渲染、API Routes 天然支持"
            },
            {
              tech: "TimescaleDB",
              reason: "PostgreSQL 扩展,原生支持时序数据,可用 SQL 查询历史 TVL/APR 趋势"
            },
            {
              tech: "FastAPI",
              reason: "异步高性能、自动 OpenAPI 文档、Pydantic 类型验证"
            },
            {
              tech: "Redis",
              reason: "高性能缓存 (< 1ms 延迟)、List 实现消息队列、Pub/Sub 实时通知"
            },
            {
              tech: "Ethers.js + viem",
              reason: "Ethers.js 成熟稳定、viem 类型安全且性能更优"
            },
            {
              tech: "Docker Compose",
              reason: "一键部署、环境隔离、服务编排、开发生产一致性"
            }
          ].map((item, i) => (
            <div key={i} className="glass p-6 rounded-[24px] border border-white/5 hover:border-accent/20 transition-all">
              <h4 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent" />
                {item.tech}
              </h4>
              <p className="text-muted text-xs leading-relaxed">{item.reason}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 扩展性设计 */}
      <div className="glass p-12 rounded-[3.5rem] border border-white/5 bg-gradient-to-br from-success/10 to-transparent">
        <h3 className="text-2xl font-black text-white tracking-tight mb-6 flex items-center gap-3">
          <Server className="w-7 h-7 text-success" /> 扩展性设计
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-white">横向扩展</h4>
            <p className="text-xs text-muted leading-relaxed">
              Strategy Worker、Scanner 可多实例部署,通过 Redis 分布式锁避免重复执行
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-white">协议接入</h4>
            <p className="text-xs text-muted leading-relaxed">
              新增协议只需在 Scanner 中添加适配器,无需修改核心逻辑
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-white">策略扩展</h4>
            <p className="text-xs text-muted leading-relaxed">
              Strategy Worker 支持插件式策略,可独立开发、测试、部署
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// 子组件
function Section({ icon, title, children }: { 
  icon: React.ReactNode; 
  title: string; 
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="flex items-center gap-3 text-2xl font-black text-white uppercase tracking-[0.1em]">
          <span className="text-accent">{icon}</span>
          {title}
        </h2>
        <div className="h-[1px] flex-1 bg-gradient-to-r from-white/10 to-transparent" />
      </div>
      {children}
    </section>
  );
}

function ModuleCard({ title, icon, tech, port, features }: {
  title: string;
  icon: React.ReactNode;
  tech: string;
  port: string;
  features: string[];
}) {
  return (
    <div className="glass-hover p-8 rounded-[3rem] border border-white/5 group">
      <div className="flex items-start gap-6 mb-6">
        <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-black text-white mb-2">{title}</h3>
          <p className="text-xs text-muted mb-2">{tech}</p>
          {port !== "-" && (
            <code className="text-[10px] text-accent bg-black/40 px-2 py-1 rounded">Port: {port}</code>
          )}
        </div>
      </div>
      <div className="space-y-2 ml-20">
        {features.map((feature, i) => {
          const [title, ...rest] = feature.split(" - ");
          const desc = rest.join(" - ");
          return (
            <div key={i} className="flex items-start gap-3 text-xs">
              <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 flex-shrink-0" />
              <p className="text-muted">
                <strong className="text-white">{title}</strong>
                {desc && <span> - {desc}</span>}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
