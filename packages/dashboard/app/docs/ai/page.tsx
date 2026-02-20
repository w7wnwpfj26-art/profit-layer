"use client";

import React from "react";
import { BookOpen, Brain, LineChart, Zap, Database, RotateCcw, Timer, Layout, Settings, GitBranch } from "lucide-react";

export default function AIDocsPage() {
  return (
    <div className="space-y-8">
      {/* 页头 */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
          <BookOpen className="w-6 h-6 text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">AI 能力说明</h1>
          <p className="text-muted text-sm">ProfitLayer AI 能力详细文档</p>
        </div>
      </div>

      {/* 文档内容 */}
      <div className="glass rounded-2xl p-8 space-y-10">
        
        {/* 一、AI 能力总览 */}
        <Section icon={<Brain className="w-5 h-5" />} title="一、AI 能力总览">
          <p className="mb-4">
            系统将「AI」分为以下几层，共同构成「可记忆、可学习、可决策」的智能体：
          </p>
          <Table
            headers={["模块", "作用", "数据来源", "输出"]}
            rows={[
              ["市场情绪感知", "判断当前市场冷热与风险偏好", "恐惧贪婪指数、BTC/ETH 价格、Gas", "综合情绪分、市场状态、一句话建议"],
              ["Alpha 信号扫描", "发现链上异常与机会", "数据库 TVL 快照、新池、大额变动", "TVL 动量、新池、鲸鱼活动等信号列表"],
              ["AI 策略顾问", "基于 LLM 或规则给出买卖/调仓建议", "池子、持仓、情绪、Alpha、记忆、准确率", "市场状态、风险等级、建议列表、参数调整建议"],
              ["AI 记忆系统", "持久化历史分析与决策摘要", "思考循环与策略执行", "供下次推理调用的「历史记忆」文本"],
              ["决策反馈闭环", "记录决策并事后评估", "决策记录 + 池子实际 APR", "准确率统计、用于 prompt 的「历史准确率」"],
              ["自主思考循环", "定时执行「收集→分析→决策→写回」", "以上全部", "思考日志、可选信号推送、参数自动调整"],
            ]}
          />
          <p className="mt-4 text-muted text-sm">
            上述模块均运行在 <code className="code">AI Engine</code>（Python FastAPI）中；Dashboard 通过 HTTP 调用 AI Engine 或直接查库展示情绪、Alpha、思考日志等。
          </p>
        </Section>

        {/* 二、市场情绪感知 */}
        <Section icon={<LineChart className="w-5 h-5" />} title="二、市场情绪感知（Market Sentiment）">
          <H3>2.1 作用</H3>
          <p className="mb-4">
            为 AI 和策略提供「当前市场处于什么状态」的量化输入，避免在极端恐慌或狂热时做出与市场情绪背离的激进决策。
          </p>
          
          <H3>2.2 数据源（均为免费公开 API）</H3>
          <Table
            headers={["来源", "内容", "说明"]}
            rows={[
              ["CoinyBubble / Alternative.me", "恐惧贪婪指数", "0–100，辅以「极度恐慌/恐慌/中性/贪婪/极度贪婪」标签"],
              ["CoinGecko", "BTC、ETH 价格及 24h 涨跌幅", "用于判断短期趋势"],
              ["各链 RPC", "当前 Gas 价格（Gwei）", "以太坊、BSC、Arbitrum、Base 等，Gas 高时倾向保守"],
            ]}
          />
          
          <H3>2.3 综合情绪分与市场状态</H3>
          <ul className="list-disc list-inside space-y-2 text-muted">
            <li><strong className="text-white">综合情绪分</strong>：0–100，由恐惧贪婪、BTC 24h 变化、ETH 24h 变化、Gas 等加权得到。</li>
            <li><strong className="text-white">市场状态（market_regime）</strong>：如「极度恐慌」「恐慌」「中性」「贪婪」「极度贪婪」等。</li>
            <li><strong className="text-white">一句话建议（suggestion）</strong>：例如「市场偏中性，可适度参与高健康分池子」。</li>
          </ul>

          <H3>2.4 在系统中的使用</H3>
          <ul className="list-disc list-inside space-y-2 text-muted">
            <li>思考循环每次运行会先调用情绪接口，将结果写入当次「思考」的输入摘要。</li>
            <li>Dashboard 首页「市场情绪」卡片请求 <code className="code">/api/sentiment</code>；若 AI 引擎不可用，返回占位数据。</li>
          </ul>

          <H3>2.5 API</H3>
          <CodeBlock>
            GET /sentiment（AI Engine）
            返回：fearGreedIndex、fearGreedLabel、btcPrice、btc24hChange、ethPrice、eth24hChange、gasGwei、compositeScore、marketRegime、suggestion、timestamp
          </CodeBlock>
        </Section>

        {/* 三、Alpha 信号扫描 */}
        <Section icon={<Zap className="w-5 h-5" />} title="三、Alpha 信号扫描（Alpha Scanner）">
          <H3>3.1 作用</H3>
          <p className="mb-4">
            从链上/数据库衍生出「可能有机会或风险」的离散信号，供 AI 和策略参考，而不是只看静态池子列表。
          </p>

          <H3>3.2 信号类型</H3>
          <Table
            headers={["类型", "含义", "数据来源"]}
            rows={[
              ["tvl_momentum", "TVL 加速流入的池子", "对比近 1 小时与 24 小时前 TVL，变化率 >10% 且 TVL 超过阈值"],
              ["new_pool", "近期新出现的高 TVL 池子", "最近 24h 内首次出现在快照中且 TVL 较高"],
              ["whale_activity", "单池 TVL 在 24h 内变化超过约 20%", "大额资金进出，可能为鲸鱼或协议动作"],
            ]}
          />

          <H3>3.3 在系统中的使用</H3>
          <ul className="list-disc list-inside space-y-2 text-muted">
            <li>思考循环会调用 Alpha Scanner 获取当次信号列表，并写入思考的「输入摘要」。</li>
            <li>Dashboard 可请求 <code className="code">/api/alpha</code> 展示信号列表。</li>
          </ul>

          <H3>3.4 API</H3>
          <CodeBlock>GET /alpha（AI Engine）：返回 signals 数组及 count。每个元素包含类型、池子、描述、强度等。</CodeBlock>

          <H3>3.5 依赖</H3>
          <p className="text-muted">依赖 <code className="code">pool_snapshots</code> 等时序数据；若 Scanner 未持续写入快照，Alpha 信号会较少或为空。</p>
        </Section>

        {/* 四、AI 策略顾问 */}
        <Section icon={<Brain className="w-5 h-5" />} title="四、AI 策略顾问（AI Advisor）">
          <H3>4.1 作用</H3>
          <p className="mb-4">
            根据「当前池子、持仓、情绪、Alpha、历史记忆、历史准确率」生成结构化建议：市场状态、风险等级、具体操作以及是否调整系统参数。
          </p>

          <H3>4.2 输入（MarketContext）</H3>
          <ul className="list-disc list-inside space-y-2 text-muted">
            <li>追踪池子数量、平均/中位数 APR、总 TVL。</li>
            <li>当前持仓列表（池子、价值、未实现盈亏、APR）。</li>
            <li>排名靠前的收益池（含协议、链、APR、TVL、健康分）。</li>
            <li>可选：近期信号、组合总价值与总盈亏。</li>
          </ul>

          <H3>4.3 输出（AIAdvice）</H3>
          <Table
            headers={["字段", "含义"]}
            rows={[
              ["market_regime", "bull / bear / sideways / volatile"],
              ["risk_level", "conservative / moderate / aggressive"],
              ["confidence", "0–1，建议的可信度"],
              ["summary", "一句话中文总结"],
              ["analysis", "多段中文分析"],
              ["recommendations", "列表：action、pool_id、symbol、reason、urgency、amount_pct"],
              ["parameter_adjustments", "建议的系统参数变更"],
            ]}
          />

          <H3>4.4 LLM 与规则引擎</H3>
          <ul className="list-disc list-inside space-y-2 text-muted">
            <li><strong className="text-white">已配置 API Key</strong>：使用 LLM（DeepSeek/OpenAI），严格按 JSON 格式输出。</li>
            <li><strong className="text-white">未配置或调用失败</strong>：使用内置规则引擎兜底，不依赖外部 API。</li>
          </ul>

          <H3>4.5 分析原则</H3>
          <ul className="list-disc list-inside space-y-2 text-muted">
            <li>安全第一；优先高健康分（≥70）池子</li>
            <li>警惕异常高 APR（&gt;200%）</li>
            <li>TVL 持续下降的池子避免或减仓</li>
            <li>稳定币作为安全垫</li>
            <li>单池不超过 25%、单链不超过 50%</li>
            <li>不确定时提高稳定币比例</li>
          </ul>

          <H3>4.6 单信号审批</H3>
          <p className="text-muted">
            策略 worker 在产生「入场/加仓」等信号时，可调用 AI 顾问做单次信号审批。若设置「AI 自动审批」为 true，则通过后可进入执行流程。
          </p>

          <H3>4.7 API</H3>
          <CodeBlock>POST /ai/analyze（AI Engine）：Body 为市场上下文，返回 AIAdvice 结构。</CodeBlock>
        </Section>

        {/* 五、AI 记忆系统 */}
        <Section icon={<Database className="w-5 h-5" />} title="五、AI 记忆系统（Memory Manager）">
          <H3>5.1 作用</H3>
          <p className="mb-4">
            把「每次重要分析或决策」的摘要持久化，在后续思考循环中作为「你的历史记忆」注入 LLM Prompt，使 AI 具备跨轮次的上下文。
          </p>

          <H3>5.2 存储</H3>
          <ul className="list-disc list-inside space-y-2 text-muted">
            <li>表：<code className="code">ai_memory</code></li>
            <li>字段：id、memory_type、summary、content（JSON）、created_at</li>
            <li>memory_type 可用于区分「分析记忆」「决策记忆」等</li>
          </ul>

          <H3>5.3 使用方式</H3>
          <ul className="list-disc list-inside space-y-2 text-muted">
            <li><strong className="text-white">写入</strong>：调用 <code className="code">MemoryManager.store(memory_type, summary, content)</code></li>
            <li><strong className="text-white">读取</strong>：调用 <code className="code">format_for_prompt(n=5)</code>，得到最近 n 条记忆的格式化文本</li>
          </ul>
        </Section>

        {/* 六、决策反馈闭环 */}
        <Section icon={<RotateCcw className="w-5 h-5" />} title="六、决策反馈闭环（Feedback Loop）">
          <H3>6.1 作用</H3>
          <p className="mb-4">
            记录每次「AI 或策略做出的决策」，事后根据池子实际 APR 评估结果为「盈利/亏损/中性」，并统计准确率。
          </p>

          <H3>6.2 存储</H3>
          <p className="text-muted mb-4">
            表 <code className="code">ai_decisions</code>，字段包括：decision_type、pool_id、symbol、chain、expected_apr、confidence、reasoning、actual_outcome、actual_apr、evaluated_at、created_at 等。
          </p>

          <H3>6.3 流程</H3>
          <ol className="list-decimal list-inside space-y-2 text-muted">
            <li><strong className="text-white">记录</strong>：产生决策时调用 record_decision()，写入 pending 状态记录</li>
            <li><strong className="text-white">评估</strong>：定时对超过 24 小时的 pending 决策，用当前池子 APR 与预期对比，更新 actual_outcome</li>
            <li><strong className="text-white">准确率报告</strong>：get_accuracy_report(days=30) 统计最近 N 天内 profit/loss/neutral 数量</li>
          </ol>

          <H3>6.4 在思考循环中的使用</H3>
          <p className="text-muted">
            思考循环会调用 <code className="code">format_for_prompt(days=30)</code> 得到一段文字，注入「你的历史决策准确率」；LLM 可据此调整建议的激进程度。
          </p>
        </Section>

        {/* 七、自主思考循环 */}
        <Section icon={<Timer className="w-5 h-5" />} title="七、自主思考循环（AI Think Loop）">
          <H3>7.1 作用</H3>
          <p className="mb-4">
            <strong className="text-white">定时</strong>执行一次完整的「数据收集 → 构建增强 Prompt → LLM 分析 → 写回记忆/日志/参数/信号」流程。
          </p>

          <H3>7.2 默认周期</H3>
          <p className="text-muted mb-4">
            默认 <strong className="text-white">3600 秒（1 小时）</strong> 执行一次；可在 AI Engine 启动参数或配置中修改。
          </p>

          <H3>7.3 单次循环步骤</H3>
          <ol className="list-decimal list-inside space-y-3 text-muted">
            <li>
              <strong className="text-white">收集数据</strong>
              <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                <li>市场情绪（MarketSentimentCollector）</li>
                <li>Alpha 信号（AlphaScanner）</li>
                <li>持仓与池子概览</li>
                <li>历史记忆（MemoryManager）</li>
                <li>决策准确率（FeedbackLoop）</li>
              </ul>
            </li>
            <li><strong className="text-white">构建增强 Prompt</strong>：将情绪分、市场状态、BTC/ETH 变化、Gas、Alpha 等全部写入「超级 Prompt」</li>
            <li><strong className="text-white">调用 AI 顾问</strong>：得到 AIAdvice（市场状态、风险等级、建议列表、参数调整建议）</li>
            <li>
              <strong className="text-white">处理输出</strong>
              <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                <li>推荐操作：构造交易信号，推送到 Redis 队列</li>
                <li>参数调整：写回 system_config</li>
                <li>记忆：将当次分析摘要写入 MemoryManager</li>
              </ul>
            </li>
            <li><strong className="text-white">写思考日志</strong>：写入表 ai_think_log，供 Dashboard 展示</li>
          </ol>

          <H3>7.4 思考日志在 Dashboard 的展示</H3>
          <p className="text-muted">
            首页请求 <code className="code">/api/ai/think-log?limit=3</code>，从数据库直接查 ai_think_log。
          </p>
        </Section>

        {/* 八、仪表盘中的 AI 相关功能 */}
        <Section icon={<Layout className="w-5 h-5" />} title="八、仪表盘中的 AI 相关功能">
          <Table
            headers={["位置", "内容", "数据来源"]}
            rows={[
              ["首页 · 市场情绪卡片", "综合情绪分、市场状态、BTC/ETH、建议", "/api/sentiment → AI Engine"],
              ["首页 · Alpha 信号", "信号列表", "/api/alpha → AI Engine"],
              ["首页 · AI 大脑思考日志", "最近 N 条思考的摘要与时间", "/api/ai/think-log → 数据库"],
              ["系统设置 · AI 策略顾问", "API Key、模型、基础地址、AI 自动审批", "system_config"],
              ["系统设置 · 测试 AI 连接", "用当前配置直接测 LLM", "/api/ai/test"],
              ["系统设置 · AI 状态", "是否已连接、当前模型、是否规则引擎兜底", "/api/ai/status"],
            ]}
          />
        </Section>

        {/* 九、配置与 API Key */}
        <Section icon={<Settings className="w-5 h-5" />} title="九、配置与 API Key">
          <H3>9.1 数据库配置（推荐）</H3>
          <p className="text-muted mb-4">在系统设置中配置：</p>
          <ul className="list-disc list-inside space-y-2 text-muted">
            <li><strong className="text-white">DeepSeek API Key</strong>：必填才使用 LLM；不填则仅规则引擎</li>
            <li><strong className="text-white">AI 模型</strong>：如 deepseek-chat、deepseek-reasoner、gpt-4o</li>
            <li><strong className="text-white">API 基础地址</strong>：如 https://api.deepseek.com、https://api.openai.com/v1</li>
            <li><strong className="text-white">AI 自动审批</strong>：开启后，策略产生的信号可经 AI 单次审批后自动进入执行流程</li>
          </ul>

          <H3>9.2 环境变量（可选）</H3>
          <p className="text-muted mb-4">
            .env 中可配置 DEEPSEEK_API_KEY、AI_MODEL、AI_BASE_URL；建议以「设置页 + DB」为主。
          </p>

          <H3>9.3 费用参考</H3>
          <ul className="list-disc list-inside space-y-2 text-muted">
            <li><strong className="text-white">DeepSeek</strong>：约 ¥0.005/次分析，每小时一次思考循环下每日成本通常不到 ¥1</li>
            <li>未配置 API Key 时无外部费用，但仅使用规则引擎</li>
          </ul>
        </Section>

        {/* 十、数据流小结 */}
        <Section icon={<GitBranch className="w-5 h-5" />} title="十、数据流小结">
          <div className="bg-black/30 rounded-xl p-6 overflow-x-auto">
            <pre className="text-xs text-muted font-mono whitespace-pre leading-relaxed">
{`                    ┌─────────────────────────────────────────────────────────┐
                    │                    AI Engine (Python)                     │
  CoinyBubble       │  ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐ │
  CoinGecko    ─────┼─►│  Market     │   │  Alpha      │   │  MemoryManager  │ │
  RPC (Gas)         │  │  Sentiment │   │  Scanner    │   │  FeedbackLoop   │ │
                    │  └──────┬──────┘   └──────┬──────┘   └────────┬────────┘ │
  DB: pools,        │         │                 │                    │         │
  positions,        │         ▼                 ▼                    ▼         │
  pool_snapshots ───┼─► ┌─────────────────────────────────────────────────────┐ │
  system_config     │   │              AI Think Loop (定时)                    │ │
                    │   │  收集 → 构建 Prompt → AIAdvisor.analyze → 写回      │ │
                    │   └─────────────────────┬───────────────────────────────┘ │
                    │                         │                                 │
  DeepSeek/OpenAI   │                         ▼                                 │
  (可选) ───────────┼─► ┌─────────────┐   ai_think_log / ai_memory /           │
                    │   │ AI Advisor  │   system_config 更新 / 信号推送 Redis   │
                    │   │ (LLM/规则)  │                                         │
                    │   └─────────────┘                                         │
                    └─────────────────────────────────────────────────────────┘
                                         │
                    Dashboard ◄──────────┘  /api/sentiment, /api/alpha,
                    (情绪、Alpha、思考日志)   /api/ai/think-log, /api/ai/status`}
            </pre>
          </div>
        </Section>

      </div>
    </div>
  );
}

// 子组件
function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-white/5 pb-8 last:border-b-0 last:pb-0">
      <h2 className="flex items-center gap-3 text-xl font-bold text-white mb-6">
        <span className="text-accent">{icon}</span>
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold text-white mt-6 mb-3">{children}</h3>;
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-white/10">
            {headers.map((h, i) => (
              <th key={i} className="text-left py-3 px-4 text-white font-semibold bg-white/5 first:rounded-tl-lg last:rounded-tr-lg">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="py-3 px-4 text-muted">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-black/30 rounded-lg p-4 text-sm font-mono text-accent/80 overflow-x-auto">
      {children}
    </pre>
  );
}
