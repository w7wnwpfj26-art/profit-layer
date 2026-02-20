"use client";

import React, { useState } from "react";
import { Code, Server, Zap, Database, Terminal, Copy, CheckCircle2 } from "lucide-react";

export default function APIPage() {
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedEndpoint(id);
    setTimeout(() => setCopiedEndpoint(null), 2000);
  };

  return (
    <div className="space-y-8 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* 页头 */}
      <div className="glass-hover glass p-12 rounded-[3.5rem] border border-white/5 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-16 opacity-[0.03] pointer-events-none group-hover:scale-110 transition-transform duration-1000">
          <Code className="w-72 h-72 text-accent" />
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-[24px] bg-accent/20 flex items-center justify-center border border-accent/30 shadow-lg shadow-accent/10">
              <Code className="w-8 h-8 text-accent" />
            </div>
            <div>
              <h1 className="text-5xl font-black text-white tracking-tight">API 文档</h1>
              <p className="text-muted-strong text-sm font-bold uppercase tracking-[0.2em] mt-2">RESTful API · WebSocket · 类型定义</p>
            </div>
          </div>
          <p className="text-muted text-sm max-w-2xl leading-relaxed mt-6">
            ProfitLayer 提供完整的 HTTP API,支持自定义集成、数据查询、策略控制等功能。
            所有接口遵循 RESTful 规范,返回 JSON 格式数据。
          </p>
        </div>
      </div>

      {/* Base URLs */}
      <Section icon={<Server className="w-6 h-6" />} title="Base URLs">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { service: "Dashboard API", url: "http://localhost:3002/api", desc: "前端聚合层,可直接查询数据库" },
            { service: "AI Engine", url: "http://localhost:8000", desc: "AI 相关接口,市场情绪、Alpha 信号等" }
          ].map((item, i) => (
            <div key={i} className="glass p-6 rounded-[24px] border border-white/5 group hover:border-accent/20 transition-all">
              <h4 className="text-sm font-bold text-white mb-3">{item.service}</h4>
              <code className="text-xs text-accent bg-black/40 px-3 py-2 rounded-lg block mb-3 break-all">
                {item.url}
              </code>
              <p className="text-xs text-muted">{item.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* AI Engine APIs */}
      <Section icon={<Zap className="w-6 h-6" />} title="AI Engine APIs">
        <div className="space-y-6">
          <APIEndpoint
            method="GET"
            path="/health"
            desc="健康检查"
            params={[]}
            response={{
              status: "healthy",
              timestamp: "2026-02-20T12:00:00.000Z",
              version: "0.1.0"
            }}
            onCopy={copyToClipboard}
            isCopied={copiedEndpoint === "health"}
          />

          <APIEndpoint
            method="GET"
            path="/sentiment"
            desc="市场情绪数据"
            params={[]}
            response={{
              fearGreedIndex: 65,
              fearGreedLabel: "Greed",
              btcPrice: 98234.56,
              btc24hChange: 2.34,
              ethPrice: 3456.78,
              eth24hChange: 1.23,
              gasGwei: { ethereum: 15, arbitrum: 0.1, base: 0.01 },
              compositeScore: 68,
              marketRegime: "bullish",
              suggestion: "市场情绪偏乐观,可适度参与高健康分池子",
              timestamp: "2026-02-20T12:00:00.000Z"
            }}
            onCopy={copyToClipboard}
            isCopied={copiedEndpoint === "sentiment"}
          />

          <APIEndpoint
            method="GET"
            path="/alpha"
            desc="Alpha 信号列表"
            params={[]}
            response={{
              signals: [
                {
                  type: "tvl_momentum",
                  pool_id: "aave-v3-usdc-ethereum",
                  description: "TVL 加速流入 +15% (1h vs 24h)",
                  strength: 0.85,
                  timestamp: "2026-02-20T11:45:00.000Z"
                },
                {
                  type: "new_pool",
                  pool_id: "curve-tricrypto-base",
                  description: "新池发现,TVL $50M,APR 45%",
                  strength: 0.72,
                  timestamp: "2026-02-20T11:30:00.000Z"
                }
              ],
              count: 2
            }}
            onCopy={copyToClipboard}
            isCopied={copiedEndpoint === "alpha"}
          />

          <APIEndpoint
            method="POST"
            path="/ai/analyze"
            desc="AI 策略分析"
            params={[
              { name: "pools", type: "Pool[]", required: true, desc: "当前追踪的池子列表" },
              { name: "positions", type: "Position[]", required: false, desc: "当前持仓" },
              { name: "sentiment", type: "SentimentData", required: false, desc: "市场情绪数据" },
              { name: "signals", type: "AlphaSignal[]", required: false, desc: "Alpha 信号" }
            ]}
            response={{
              market_regime: "bull",
              risk_level: "moderate",
              confidence: 0.78,
              summary: "市场偏乐观,建议适度加仓 Aave USDC 池",
              analysis: "当前 BTC 上涨 2.3%,恐惧贪婪指数 65...",
              recommendations: [
                {
                  action: "enter_pool",
                  pool_id: "aave-v3-usdc-ethereum",
                  symbol: "USDC",
                  reason: "TVL 稳定,健康分 85,APR 8.5%",
                  urgency: "medium",
                  amount_pct: 15
                }
              ],
              parameter_adjustments: [
                {
                  key: "health_threshold",
                  current_value: 70,
                  suggested_value: 75,
                  reason: "市场波动加大,提高健康分要求"
                }
              ]
            }}
            onCopy={copyToClipboard}
            isCopied={copiedEndpoint === "ai-analyze"}
          />
        </div>
      </Section>

      {/* Dashboard APIs */}
      <Section icon={<Database className="w-6 h-6" />} title="Dashboard APIs">
        <div className="space-y-6">
          <APIEndpoint
            method="GET"
            path="/api/pools"
            desc="池子列表"
            params={[
              { name: "chain", type: "string", required: false, desc: "链筛选: ethereum, arbitrum, base, bsc, polygon" },
              { name: "protocol", type: "string", required: false, desc: "协议筛选: aave, compound, curve, uniswap" },
              { name: "minApr", type: "number", required: false, desc: "最小 APR" },
              { name: "minHealthScore", type: "number", required: false, desc: "最小健康分" },
              { name: "limit", type: "number", required: false, desc: "返回数量,默认 50" }
            ]}
            response={{
              pools: [
                {
                  id: "aave-v3-usdc-ethereum",
                  protocol: "aave-v3",
                  chain: "ethereum",
                  symbol: "USDC",
                  tvl: 1234567890,
                  apr: 8.5,
                  health_score: 85,
                  risk_score: 15,
                  updated_at: "2026-02-20T12:00:00.000Z"
                }
              ],
              count: 1,
              total: 523
            }}
            onCopy={copyToClipboard}
            isCopied={copiedEndpoint === "pools"}
          />

          <APIEndpoint
            method="GET"
            path="/api/positions"
            desc="用户持仓"
            params={[
              { name: "address", type: "string", required: true, desc: "钱包地址" }
            ]}
            response={{
              positions: [
                {
                  pool_id: "aave-v3-usdc-ethereum",
                  symbol: "USDC",
                  amount: 10000,
                  value_usd: 10000,
                  entry_price: 1.0,
                  current_price: 1.0,
                  unrealized_pnl: 0,
                  unrealized_pnl_pct: 0,
                  apr: 8.5,
                  entered_at: "2026-02-15T10:00:00.000Z"
                }
              ],
              total_value_usd: 10000,
              total_pnl_usd: 0
            }}
            onCopy={copyToClipboard}
            isCopied={copiedEndpoint === "positions"}
          />

          <APIEndpoint
            method="GET"
            path="/api/ai/think-log"
            desc="AI 思考日志"
            params={[
              { name: "limit", type: "number", required: false, desc: "返回数量,默认 10" }
            ]}
            response={{
              logs: [
                {
                  id: 123,
                  summary: "市场偏乐观,建议适度加仓",
                  market_regime: "bull",
                  risk_level: "moderate",
                  actions_count: 2,
                  created_at: "2026-02-20T12:00:00.000Z"
                }
              ],
              count: 1
            }}
            onCopy={copyToClipboard}
            isCopied={copiedEndpoint === "think-log"}
          />

          <APIEndpoint
            method="GET"
            path="/api/ops"
            desc="运营监控数据"
            params={[]}
            response={{
              business_metrics: {
                total_pools_tracked: 523,
                total_users: 42,
                total_tvl_managed: 12345678,
                total_transactions_24h: 156,
                avg_apy: 15.6
              },
              system_health: {
                ai_engine: { status: "healthy", uptime_pct: 99.8 },
                executor: { status: "healthy", uptime_pct: 99.9 },
                database: { status: "healthy", query_time_ms: 12 }
              },
              data_sources: [
                {
                  name: "DefiLlama",
                  status: "operational",
                  last_sync: "2026-02-20T11:55:00.000Z",
                  pools_fetched: 523
                }
              ]
            }}
            onCopy={copyToClipboard}
            isCopied={copiedEndpoint === "ops"}
          />
        </div>
      </Section>

      {/* 类型定义 */}
      <Section icon={<Terminal className="w-6 h-6" />} title="TypeScript 类型定义">
        <div className="glass p-10 rounded-[3rem] border border-white/5">
          <pre className="text-xs text-muted font-mono leading-loose overflow-x-auto">
{`// Pool 池子
interface Pool {
  id: string;
  protocol: string;
  chain: string;
  symbol: string;
  tvl: number;
  apr: number;
  health_score: number;
  risk_score: number;
  updated_at: string;
}

// Position 持仓
interface Position {
  pool_id: string;
  symbol: string;
  amount: number;
  value_usd: number;
  entry_price: number;
  current_price: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  apr: number;
  entered_at: string;
}

// AI Advice AI 建议
interface AIAdvice {
  market_regime: "bull" | "bear" | "sideways" | "volatile";
  risk_level: "conservative" | "moderate" | "aggressive";
  confidence: number; // 0-1
  summary: string;
  analysis: string;
  recommendations: Recommendation[];
  parameter_adjustments?: ParameterAdjustment[];
}

// Recommendation 推荐操作
interface Recommendation {
  action: "enter_pool" | "add_position" | "exit_pool" | "rebalance";
  pool_id: string;
  symbol: string;
  reason: string;
  urgency: "low" | "medium" | "high";
  amount_pct: number; // 建议资金百分比
}

// Alpha Signal Alpha 信号
interface AlphaSignal {
  type: "tvl_momentum" | "new_pool" | "whale_activity";
  pool_id: string;
  description: string;
  strength: number; // 0-1
  timestamp: string;
}`}
          </pre>
        </div>
      </Section>

      {/* 认证 & 限流 */}
      <div className="glass p-12 rounded-[3.5rem] border border-white/5 bg-gradient-to-br from-warning/10 to-transparent">
        <h3 className="text-2xl font-black text-white tracking-tight mb-6">🔐 认证 & 限流</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white">认证方式</h4>
            <p className="text-xs text-muted leading-relaxed">
              当前版本 API 无需认证,适用于本地部署或内网环境。
              如需公网暴露,建议配置 API Key 或 JWT Token。
            </p>
            <div className="p-4 rounded-xl bg-black/40 border border-white/10">
              <code className="text-xs text-accent">
                Authorization: Bearer YOUR_API_KEY
              </code>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white">限流规则</h4>
            <p className="text-xs text-muted leading-relaxed mb-4">
              为保护系统稳定性,部分接口有访问频率限制:
            </p>
            <div className="space-y-2 text-xs text-muted">
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                <span>/api/pools</span>
                <span className="text-accent font-bold">60 req/min</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                <span>/ai/analyze</span>
                <span className="text-accent font-bold">10 req/min</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                <span>/sentiment</span>
                <span className="text-accent font-bold">30 req/min</span>
              </div>
            </div>
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

function APIEndpoint({ 
  method, 
  path, 
  desc, 
  params, 
  response,
  onCopy,
  isCopied
}: {
  method: string;
  path: string;
  desc: string;
  params: Array<{ name: string; type: string; required: boolean; desc: string }>;
  response: any;
  onCopy: (text: string, id: string) => void;
  isCopied: boolean;
}) {
  const methodColors: Record<string, string> = {
    GET: "success",
    POST: "accent",
    PUT: "warning",
    DELETE: "error"
  };
  const color = methodColors[method] || "muted";
  const endpointId = path.replace(/\//g, "-");

  return (
    <div className="glass-hover p-8 rounded-[3rem] border border-white/5 group">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4 flex-1">
          <span className={`px-3 py-1.5 rounded-lg bg-${color}/20 text-${color} text-xs font-black uppercase tracking-wider border border-${color}/30`}>
            {method}
          </span>
          <code className="text-sm text-white font-mono">{path}</code>
        </div>
        <button
          onClick={() => onCopy(`${method} ${path}`, endpointId)}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-accent/30 transition-all"
          title="复制"
        >
          {isCopied ? (
            <CheckCircle2 className="w-4 h-4 text-success" />
          ) : (
            <Copy className="w-4 h-4 text-muted" />
          )}
        </button>
      </div>

      <p className="text-muted text-xs mb-6">{desc}</p>

      {params.length > 0 && (
        <div className="mb-6">
          <h4 className="text-xs font-bold text-white mb-3">参数</h4>
          <div className="space-y-2">
            {params.map((param, i) => (
              <div key={i} className="flex items-start gap-4 p-3 rounded-lg bg-black/40 border border-white/5">
                <code className="text-xs text-accent font-mono">{param.name}</code>
                <span className="text-[10px] text-muted-strong bg-white/10 px-2 py-0.5 rounded">{param.type}</span>
                {param.required && (
                  <span className="text-[10px] text-error bg-error/20 px-2 py-0.5 rounded">必填</span>
                )}
                <span className="text-xs text-muted flex-1">{param.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h4 className="text-xs font-bold text-white mb-3">响应示例</h4>
        <pre className="text-xs text-accent/80 font-mono leading-loose bg-black/40 rounded-xl p-6 overflow-x-auto border border-white/5">
          {JSON.stringify(response, null, 2)}
        </pre>
      </div>
    </div>
  );
}
