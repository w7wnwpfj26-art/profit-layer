# ProfitLayer: 智能资产矩阵 (Intelligent Asset Matrix) - AI 能力说明

本文档**详细说明**系统中与 AI 相关的全部能力：数据输入、推理逻辑、记忆与反馈、自主思考循环，以及如何在仪表盘与配置中使用这些能力。

---

## 一、AI 能力总览

系统将「AI」分为以下几层，共同构成「可记忆、可学习、可决策」的智能体：

| 模块 | 作用 | 数据来源 | 输出 |
|------|------|----------|------|
| 市场情绪感知 | 判断当前市场冷热与风险偏好 | 恐惧贪婪指数、BTC/ETH 价格、Gas | 综合情绪分、市场状态、一句话建议 |
| Alpha 信号扫描 | 发现链上异常与机会 | 数据库 TVL 快照、新池、大额变动 | TVL 动量、新池、鲸鱼活动等信号列表 |
| AI 策略顾问 | 基于 LLM 或规则给出买卖/调仓建议 | 池子、持仓、情绪、Alpha、记忆、准确率 | 市场状态、风险等级、建议列表、参数调整建议 |
| AI 记忆系统 | 持久化历史分析与决策摘要 | 思考循环与策略执行 | 供下次推理调用的「历史记忆」文本 |
| 决策反馈闭环 | 记录决策并事后评估 | 决策记录 + 池子实际 APR | 准确率统计、用于 prompt 的「历史准确率」 |
| 自主思考循环 | 定时执行「收集→分析→决策→写回」 | 以上全部 | 思考日志、可选信号推送、参数自动调整 |

上述模块均运行在 **AI Engine**（Python FastAPI）中；Dashboard 通过 HTTP 调用 AI Engine 或直接查库展示情绪、Alpha、思考日志等。

---

## 二、市场情绪感知（Market Sentiment）

### 2.1 作用

为 AI 和策略提供「当前市场处于什么状态」的量化输入，避免在极端恐慌或狂热时做出与市场情绪背离的激进决策。

### 2.2 数据源（均为免费公开 API）

| 来源 | 内容 | 说明 |
|------|------|------|
| CoinyBubble / Alternative.me | 恐惧贪婪指数 | 0–100，辅以「极度恐慌/恐慌/中性/贪婪/极度贪婪」标签 |
| CoinGecko | BTC、ETH 价格及 24h 涨跌幅 | 用于判断短期趋势 |
| 各链 RPC | 当前 Gas 价格（Gwei） | 以太坊、BSC、Arbitrum、Base 等，Gas 高时倾向保守 |

### 2.3 综合情绪分与市场状态

- **综合情绪分**：0–100，由恐惧贪婪、BTC 24h 变化、ETH 24h 变化、Gas 等加权得到。
- **市场状态（market_regime）**：如「极度恐慌」「恐慌」「中性」「贪婪」「极度贪婪」等，用于自然语言建议和 LLM 的上下文。
- **一句话建议（suggestion）**：例如「市场偏中性，可适度参与高健康分池子」。

### 2.4 在系统中的使用

- 思考循环每次运行会先调用情绪接口，将结果写入当次「思考」的输入摘要。
- Dashboard 首页「市场情绪」卡片请求 `/api/sentiment`（后端转发 AI Engine `/sentiment`）；若 AI 引擎不可用，返回占位数据（如 50 分、中性）。

### 2.5 API

- **GET /sentiment**（AI Engine）：返回 `fearGreedIndex`、`fearGreedLabel`、`btcPrice`、`btc24hChange`、`ethPrice`、`eth24hChange`、`gasGwei`、`compositeScore`、`marketRegime`、`suggestion`、`timestamp` 等。

---

## 三、Alpha 信号扫描（Alpha Scanner）

### 3.1 作用

从链上/数据库衍生出「可能有机会或风险」的离散信号，供 AI 和策略参考，而不是只看静态池子列表。

### 3.2 信号类型

| 类型 | 含义 | 数据来源 |
|------|------|----------|
| tvl_momentum | TVL 加速流入的池子 | 对比近 1 小时与 24 小时前 TVL，变化率 >10% 且 TVL 超过阈值 |
| new_pool | 近期新出现的高 TVL 池子 | 最近 24h 内首次出现在快照中且 TVL 较高 |
| whale_activity | 单池 TVL 在 24h 内变化超过约 20% | 大额资金进出，可能为鲸鱼或协议动作 |

每个信号包含：`signal_type`、`pool_id`、`symbol`、`protocol_id`、`chain`、`description`（中文）、`strength`（0–1）、`timestamp` 等。

### 3.3 在系统中的使用

- 思考循环会调用 Alpha Scanner 获取当次信号列表，并写入思考的「输入摘要」和 `full_input`；LLM 会看到「当前有哪些 Alpha 信号」。
- Dashboard 可请求 `/api/alpha`（转发 AI Engine `/alpha`）展示信号列表；无数据或引擎离线时返回空数组。

### 3.4 API

- **GET /alpha**（AI Engine）：返回 `signals` 数组及 `count`。每个元素包含类型、池子、描述、强度等。

### 3.5 依赖

- 依赖 `pool_snapshots` 等时序数据；若 Scanner 未持续写入快照，Alpha 信号会较少或为空。

---

## 四、AI 策略顾问（AI Advisor）

### 4.1 作用

根据「当前池子、持仓、情绪、Alpha、历史记忆、历史准确率」生成结构化建议：市场状态、风险等级、具体操作（入场/出场/加仓/减仓/复投）以及是否调整系统参数。

### 4.2 输入（MarketContext）

- 追踪池子数量、平均/中位数 APR、总 TVL。
- 当前持仓列表（池子、价值、未实现盈亏、APR）。
- 排名靠前的收益池（含协议、链、APR、TVL、健康分）。
- 可选：近期信号、组合总价值与总盈亏。

这些由调用方（如思考循环、或单独的分析接口）从数据库与情绪/Alpha 结果组装而成。

### 4.3 输出（AIAdvice）

| 字段 | 含义 |
|------|------|
| market_regime | bull / bear / sideways / volatile |
| risk_level | conservative / moderate / aggressive |
| confidence | 0–1，建议的可信度 |
| summary | 一句话中文总结 |
| analysis | 多段中文分析 |
| recommendations | 列表：action（enter/exit/hold/increase/decrease/compound）、pool_id、symbol、reason、urgency、amount_pct 等 |
| parameter_adjustments | 建议的系统参数变更，如 max_risk_score、min_health_score、compound_interval_hr、stop_loss_pct、rebalance_threshold_pct |

### 4.4 LLM 与规则引擎

- **已配置 API Key（DeepSeek/OpenAI）**：使用 LLM，严格按 JSON 格式输出上述结构；系统会解析并转为 `AIAdvice`。
- **未配置或调用失败**：使用内置**规则引擎**兜底（如根据平均 APR 简单判断牛熊、给出保守建议），不依赖外部 API。

### 4.5 分析原则（写于 System Prompt）

- 安全第一；优先高健康分（≥70）池子；警惕异常高 APR（>200%）；TVL 持续下降的池子避免或减仓；稳定币作为安全垫；单池不超过 25%、单链不超过 50%；不确定时提高稳定币比例等。

### 4.6 单信号审批（evaluate_signal）

- 策略 worker 在产生「入场/加仓」等信号时，可调用 AI 顾问做**单次信号审批**：将信号与简要上下文发给 LLM，返回是否通过。若设置「AI 自动审批」为 true，则通过后可进入执行流程；否则仅记录或需人工确认。

### 4.7 API

- **POST /ai/analyze**（AI Engine）：Body 为市场上下文，返回 `AIAdvice` 结构。
- Dashboard「测试 AI 连接」等会使用配置的 API Key 和模型，直接调 LLM 或通过 AI Engine 的测试接口验证。

---

## 五、AI 记忆系统（Memory Manager）

### 5.1 作用

把「每次重要分析或决策」的摘要持久化，在后续思考循环中作为「你的历史记忆」注入 LLM Prompt，使 AI 具备跨轮次的上下文。

### 5.2 存储

- 表：`ai_memory`。
- 字段：`id`、`memory_type`、`summary`、`content`（JSON）、`created_at`。
- `memory_type` 可用于区分「分析记忆」「决策记忆」等；`summary` 为短文本，`content` 可存更详细结构。

### 5.3 使用方式

- **写入**：思考循环或策略在执行完分析/决策后，调用 `MemoryManager.store(memory_type, summary, content)`。
- **读取**：思考循环构建 Prompt 时调用 `format_for_prompt(n=5)`，得到最近 n 条记忆的格式化文本（如「- [时间] [类型] 摘要」），拼进「你的历史记忆」段落。

---

## 六、决策反馈闭环（Feedback Loop）

### 6.1 作用

记录每次「AI 或策略做出的决策」（如入场某池、预期 APR），事后根据池子实际 APR 评估结果为「盈利/亏损/中性」，并统计准确率，供后续思考循环的 Prompt 使用（「你的历史决策准确率」）。

### 6.2 存储

- 表：`ai_decisions`。
- 字段：`decision_type`、`pool_id`、`symbol`、`chain`、`expected_apr`、`confidence`、`reasoning`、`actual_outcome`（pending/profit/loss/neutral）、`actual_apr`、`evaluated_at`、`created_at` 等。

### 6.3 流程

1. **记录**：产生决策时调用 `FeedbackLoop.record_decision(...)`，写入一条 `actual_outcome='pending'` 的记录。
2. **评估**：定时或在下一次思考前调用 `evaluate_decisions()`：对创建超过 24 小时的 pending 决策，用当前池子 APR 与预期对比，更新 `actual_apr`、`actual_outcome`（如预期 80% 以上为 profit，50%–80% 为 neutral，否则 loss）。
3. **准确率报告**：`get_accuracy_report(days=30)` 统计最近 N 天内 profit/loss/neutral 数量及平均置信度等，用于 Prompt 中的「历史准确率」描述。

### 6.4 在思考循环中的使用

- 思考循环会调用 `format_for_prompt(days=30)` 得到一段文字，注入「你的历史决策准确率」；LLM 可据此调整建议的激进程度。

---

## 七、自主思考循环（AI Think Loop）

### 7.1 作用

**定时**执行一次完整的「数据收集 → 构建增强 Prompt → LLM 分析 → 写回记忆/日志/参数/信号」流程，使系统具备「不用人工触发也能周期性思考」的能力。

### 7.2 默认周期

- 默认 **3600 秒（1 小时）** 执行一次；可在 AI Engine 启动参数或配置中修改（如改为 60 秒用于测试）。

### 7.3 单次循环步骤

1. **收集数据**  
   - 市场情绪（`MarketSentimentCollector.get_composite_sentiment()`）  
   - Alpha 信号（`AlphaScanner.get_alpha_signals()`）  
   - 持仓与池子概览（从数据库查 positions、pools、TVL、APR 等）  
   - 历史记忆（`MemoryManager.format_for_prompt(n=5)`）  
   - 决策准确率（`FeedbackLoop.format_for_prompt(days=30)`）

2. **构建增强 Prompt**  
   - 将情绪分、市场状态、BTC/ETH 变化、Gas、Alpha 数量与代表信号、记忆、准确率等全部写入一段「超级 Prompt」，与池子/持仓一起发给 AI 顾问。

3. **调用 AI 顾问**  
   - `AIAdvisor.analyze(context)`，得到 `AIAdvice`（市场状态、风险等级、建议列表、参数调整建议）。

4. **处理输出**  
   - **推荐操作**：从 `recommendations` 中取最多 3 条合法 action（enter/exit/decrease/increase/compound），构造交易信号，推送到 Redis 队列（如 `bull:execute-tx:events`），供 Executor 消费（若开启自动执行）。  
   - **参数调整**：对 `parameter_adjustments` 中允许的键（如 `max_risk_score`、`min_health_score`、`compound_interval_hr`、`stop_loss_pct`、`rebalance_threshold_pct`）写回 `system_config`。  
   - **记忆**：可将当次分析摘要写入 `MemoryManager`。  
   - **反馈**：若有具体决策（如建议入场某池），可调用 `FeedbackLoop.record_decision(...)`。

5. **写思考日志**  
   - 将当次 cycle_id、输入摘要（情绪+Alpha 数量）、输出摘要（advice.summary）、完整输入/输出 JSON、耗时、actions_taken 写入表 `ai_think_log`，供 Dashboard「AI 大脑思考日志」展示。

### 7.4 思考日志在 Dashboard 的展示

- 首页或相关区块请求 `/api/ai/think-log?limit=3`（或更多）。  
- 该接口从数据库直接查 `ai_think_log`，不依赖 AI Engine 实时运行；只要历史有跑过思考循环，就会有记录。

### 7.5 依赖

- 需 AI Engine 进程运行；且需数据库中存在 `ai_think_log`、`ai_memory`、`ai_decisions` 表（见 [设置指南](./设置指南.md) 中的迁移说明）。

---

## 八、仪表盘中的 AI 相关功能

| 位置 | 内容 | 数据来源 |
|------|------|----------|
| 首页 · 市场情绪卡片 | 综合情绪分、市场状态、BTC/ETH、建议 | `/api/sentiment` → AI Engine `/sentiment` |
| 首页 · Alpha 信号（若有） | 信号列表 | `/api/alpha` → AI Engine `/alpha` |
| 首页 · AI 大脑思考日志 | 最近 N 条思考的摘要与时间 | `/api/ai/think-log` → 数据库 `ai_think_log` |
| 系统设置 · AI 策略顾问 | API Key、模型、基础地址、AI 自动审批 | `system_config`（deepseek_api_key、ai_model、ai_base_url、ai_auto_approve） |
| 系统设置 · 测试 AI 连接 | 用当前配置直接测 LLM | `/api/ai/test`，读 DB 配置后请求 DeepSeek/OpenAI |
| 系统设置 · AI 状态 | 是否已连接、当前模型、是否规则引擎兜底 | `/api/ai/status`，可结合对 AI Engine 的探测 |

---

## 九、配置与 API Key

### 9.1 数据库配置（推荐）

- 在 **系统设置** 中配置：
  - **DeepSeek API Key**：必填才使用 LLM；不填则仅规则引擎。
  - **AI 模型**：如 `deepseek-chat`、`deepseek-reasoner`、`gpt-4o` 等。
  - **API 基础地址**：如 `https://api.deepseek.com`、`https://api.openai.com/v1`。
  - **AI 自动审批**：开启后，策略产生的信号可经 AI 单次审批后自动进入执行流程（具体是否执行还受全自动/模拟模式等控制）。

若设置页没有这些项，需在 `system_config` 中插入对应 key（见 [设置指南](./设置指南.md)）。

### 9.2 环境变量（可选）

- `.env` 中可配置 `DEEPSEEK_API_KEY`、`AI_MODEL`、`AI_BASE_URL`；若 AI Engine 优先读环境变量，则与 DB 配置的优先级以代码实现为准。建议以「设置页 + DB」为主，便于在界面修改与审计。

### 9.3 费用参考

- DeepSeek：约 ¥0.005/次分析量级（每百万 token 约 ¥2），每小时一次思考循环下每日成本通常不到 ¥1。  
- 未配置 API Key 时无外部费用，但仅使用规则引擎，建议与回测结果结合评估是否满足需求。

---

## 十、数据流小结

```
                    ┌─────────────────────────────────────────────────────────┐
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
                    (情绪、Alpha、思考日志)   /api/ai/think-log, /api/ai/status
```

---

## 十一、相关文档

- [设置指南](./设置指南.md)：环境变量、数据库、服务启动、所有配置项说明  
- [快速开始](./快速开始.md)：最小化启动步骤  
- [ARCHITECTURE](./ARCHITECTURE.md)：系统架构与 AI 依赖表说明  
