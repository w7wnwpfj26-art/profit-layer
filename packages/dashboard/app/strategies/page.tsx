"use client";

import { useEffect, useState, useCallback } from "react";
import { 
  BrainCircuit, 
  Play, 
  Square, 
  Zap, 
  ShieldAlert, 
  LineChart as LineChartIcon,
  Cpu,
  BarChart3,
  TrendingUp,
  Activity,
  Loader2,
  AlertCircle,
  RefreshCcw,
} from "lucide-react";
import { formatCurrency } from "../lib/utils";
import { apiFetch } from "../lib/api";
import { PageSkeleton } from "../components/Skeleton";
import { FeedbackBar } from "../components/FeedbackBar";

// 策略定义
const STRATEGY_DEFS = [
  {
    id: "yield_farming_v1",
    name: "流动性挖矿优化器",
    type: "yield_farming",
    icon: <Zap className="w-6 h-6 text-accent" />,
    description: "AI 优化的多链流动性挖矿策略，使用夏普比率进行资金分配，扣除交易磨损后计算净收益。",
    tags: ["多链", "自动复投", "夏普优化"],
    risk: "中",
  },
  {
    id: "lending_arb_v1",
    name: "借贷套利",
    type: "lending_arb",
    icon: <Cpu className="w-6 h-6 text-success" />,
    description: "利用不同借贷协议之间的利率差进行套利（Aave、Compound 等），监控清算风险。",
    tags: ["Aave", "Compound", "利率差"],
    risk: "低",
  },
  {
    id: "staking_v1",
    name: "流动性质押 + 再质押",
    type: "staking",
    icon: <ShieldAlert className="w-6 h-6 text-warning" />,
    description: "通过 Lido/EigenLayer 等质押原生代币，叠加再质押收益，低风险稳定回报。",
    tags: ["Lido", "EigenLayer", "低风险"],
    risk: "低",
  },
  {
    id: "funding_rate_arb",
    name: "资金费率套利",
    type: "funding_rate_arb",
    icon: <LineChartIcon className="w-6 h-6 text-danger" />,
    description: "Delta 中性策略：做多现货 + 做空永续合约，收取资金费率，与市场涨跌无关。",
    tags: ["Delta 中性", "资金费率", "对冲"],
    risk: "低",
  },
  {
    id: "rwa_yield",
    name: "RWA 国债收益",
    type: "rwa",
    icon: <BarChart3 className="w-6 h-6 text-accent" />,
    description: "配置链上代币化美国国债（sDAI/USDY），4-5% 低风险保底收益，作为投资组合安全垫。",
    tags: ["sDAI", "USDY", "保底 4-5%"],
    risk: "稳健",
  },
  {
    id: "cross_dex_arb",
    name: "跨 DEX 套利",
    type: "cross_dex_arb",
    icon: <TrendingUp className="w-6 h-6 text-success" />,
    description: "检测不同 DEX 之间的价格差异并通过 DEX 聚合器执行盈利交易。",
    tags: ["1inch", "Jupiter", "价差检测"],
    risk: "中",
  },
];

interface StrategyDbRow {
  strategyId: string;
  isActive: boolean;
  totalAllocatedUsd: number;
  totalPnlUsd: number;
}

export default function StrategiesPage() {
  const [dbStrategies, setDbStrategies] = useState<StrategyDbRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoPilotStatus, setAutoPilotStatus] = useState<string>("unknown");
  const [toggling, setToggling] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [feedback, setFeedback] = useState<{ message: string; variant: "success" | "error" | "warning" } | null>(null);

  const fetchStrategies = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    setError(null);
    const result = await apiFetch<{ strategies?: StrategyDbRow[]; autoPilotStatus?: string }>("/api/strategies");
    if (result.ok) {
      setDbStrategies(result.data.strategies || []);
      setAutoPilotStatus(result.data.autoPilotStatus ?? "disabled");
      setLastUpdated(new Date());
    } else {
      setError(result.error);
    }
    if (isInitial) setLoading(false);
  }, []);

  useEffect(() => {
    fetchStrategies(true);
    const timer = setInterval(() => fetchStrategies(), 8000); 
    return () => clearInterval(timer);
  }, [fetchStrategies]);

  const toggleStrategy = async (strategyId: string, currentActive: boolean) => {
    setToggling(strategyId);
    setFeedback(null);
    const result = await apiFetch("/api/strategies", {
      method: "POST",
      body: JSON.stringify({ strategyId, isActive: !currentActive }),
    });
    if (result.ok) {
      await fetchStrategies();
      setFeedback({ message: currentActive ? "策略已停止" : "策略已启动", variant: "success" });
    } else {
      setFeedback({ message: result.error, variant: "error" });
    }
    setToggling(null);
  };

  const activeCount = dbStrategies.filter((s) => s.isActive).length;
  const totalAllocated = dbStrategies.reduce((s, r) => s + r.totalAllocatedUsd, 0);
  const totalPnl = dbStrategies.reduce((s, r) => s + r.totalPnlUsd, 0);

  if (loading) return <PageSkeleton type="strategies" />;

  return (
    <div className="space-y-10 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* 头部展示 - 增强 Premium 质感 */}
      <div className="relative p-12 rounded-[3.5rem] overflow-hidden glass border-white/5 group shadow-2xl">
        <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none group-hover:scale-110 transition-transform duration-1000">
          <BrainCircuit className="w-64 h-64 text-accent rotate-12" />
        </div>
        
        <div className="relative z-10 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-10">
          <div className="max-w-2xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="px-4 py-1.5 rounded-full bg-accent/20 text-accent text-[10px] font-black uppercase tracking-[0.2em] border border-accent/20 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
                AI 核心调度引擎 v1.2
              </div>
              <span className="text-muted text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                <RefreshCcw className="w-3 h-3 animate-spin-slow" />
                同步于 {lastUpdated.toLocaleTimeString()}
              </span>
            </div>
            <h2 className="text-6xl font-black text-white tracking-tighter leading-tight font-outfit">
              策略矩阵 <span className="text-gradient-accent">调度中心</span>
            </h2>
            <p className="text-muted text-base mt-6 max-w-xl leading-relaxed font-medium opacity-80">
              实时管理多链自动收益策略。AutoPilot 系统会根据市场波动、Gas 磨损及风险评分，
              动态调整各策略的资金权重与执行频率，实现收益最大化。
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch gap-6">
            <div className="flex items-center gap-8 bg-black/40 backdrop-blur-3xl p-8 rounded-[2.5rem] border border-white/10 shadow-2xl">
              <div className="flex flex-col pr-8 border-r border-white/10">
                <span className="text-[10px] font-black text-muted uppercase tracking-[0.2em] mb-3 opacity-60">AutoPilot 核心状态</span>
                <div className="flex items-center gap-4">
                  <div className={`w-3.5 h-3.5 rounded-full ${
                    autoPilotStatus === "running" ? "bg-success shadow-[0_0_20px_rgba(16,185,129,0.8)] animate-pulse" : 
                    autoPilotStatus === "dry_run" ? "bg-warning shadow-[0_0_20px_rgba(245,158,11,0.8)]" : 
                    "bg-white/10"
                  }`} />
                  <span className="text-2xl font-black text-white uppercase tracking-tighter">
                    {autoPilotStatus === "running" ? "运行中" : autoPilotStatus === "dry_run" ? "模拟模式" : "已挂起"}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => { window.location.href = "/settings"; }}
                className="group relative px-10 py-5 rounded-2xl bg-accent/10 hover:bg-accent text-white font-black text-[11px] transition-all uppercase tracking-widest border border-accent/20 active:scale-95 shadow-lg shadow-accent/10"
              >
                <div className="flex items-center gap-2">
                  全局配置 <TrendingUp className="w-3.5 h-3.5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* 统计栏 - 栅格化增强 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-12 mt-16 relative z-10 pt-12 border-t border-white/5">
          <StatBox label="已启策略 / 总数" value={`${activeCount} / ${STRATEGY_DEFS.length}`} />
          <StatBox label="已分配总资金" value={`$${formatCurrency(totalAllocated)}`} />
          <StatBox label="累计净收益" value={`$${formatCurrency(totalPnl)}`} isTrend color={totalPnl >= 0 ? "success" : "danger"} />
          <StatBox label="系统健康度" value="100%" icon={<Activity className="w-5 h-5 text-success animate-pulse" />} />
        </div>
      </div>

      {error && (
        <FeedbackBar
          message={`控制台警告：${error}。正在尝试自动重连...`}
          variant="error"
          onDismiss={() => setError(null)}
          autoDismissMs={0}
        />
      )}
      {feedback && (
        <FeedbackBar
          message={feedback.message}
          variant={feedback.variant}
          onDismiss={() => setFeedback(null)}
          autoDismissMs={4000}
        />
      )}

      {/* 策略列表 - 交错动画入场 */}
      <div className="grid grid-cols-1 gap-8">
        {STRATEGY_DEFS.map((strategy, index) => {
          const db = dbStrategies.find((s) => s.strategyId === strategy.id);
          const isActive = db?.isActive || false;
          const allocated = db?.totalAllocatedUsd || 0;
          const pnl = db?.totalPnlUsd || 0;
          const isToggling = toggling === strategy.id;

          return (
            <div 
              key={strategy.id} 
              style={{ animationDelay: `${index * 100}ms` }}
              className={`group glass rounded-[3.5rem] p-1 border-white/5 transition-all duration-700 hover:border-white/20 shadow-2xl stagger-in ${
                isActive ? 'shadow-[0_40px_100px_rgba(99,102,241,0.15)] border-accent/20' : 'opacity-70 hover:opacity-100'
              }`}
            >
              <div className="p-12 flex flex-col lg:flex-row justify-between gap-12">
                {/* 详情部分 */}
                <div className="flex-1 flex items-start gap-10">
                  <div className={`w-24 h-24 rounded-[2.5rem] flex items-center justify-center border transition-all duration-700 ${
                    isActive 
                      ? "bg-accent/15 border-accent/30 shadow-[0_20px_50px_rgba(99,102,241,0.3)] scale-110" 
                      : "bg-white/5 border-white/10 grayscale opacity-40 group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-105"
                  }`}>
                    <div className={isActive ? "animate-float" : ""}>
                      {strategy.icon}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center gap-5">
                      <h3 className="text-4xl font-black text-white tracking-tight group-hover:text-accent transition-colors">{strategy.name}</h3>
                      <div className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase border flex items-center gap-2.5 ${
                        strategy.risk === "稳健" ? "text-success border-success/30 bg-success/5" :
                        strategy.risk === "低" ? "text-accent border-accent/30 bg-accent/5" :
                        "text-warning border-warning/30 bg-warning/5"
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          strategy.risk === "稳健" ? "bg-success" : 
                          strategy.risk === "低" ? "bg-accent" : "bg-warning"
                        } ${isActive ? 'animate-pulse' : ''}`} />
                        {strategy.risk}风险等级
                      </div>
                    </div>
                    <p className="text-muted text-base max-w-2xl leading-relaxed font-medium opacity-80">
                      {strategy.description}
                    </p>
                    <div className="flex gap-3 pt-3">
                      {strategy.tags.map((tag) => (
                        <span key={tag} className="text-[10px] font-black px-5 py-2 rounded-xl bg-white/5 text-muted border border-white/5 uppercase tracking-widest group-hover:text-white group-hover:border-white/10 transition-all">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 指标与操作 - 更加分明的布局 */}
                <div className="flex flex-wrap lg:flex-nowrap items-center gap-12 lg:min-w-[550px] border-l border-white/5 lg:pl-12">
                  <div className="flex-1 grid grid-cols-2 gap-12">
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] opacity-60">当前资金分配</p>
                      <p className="text-3xl font-black text-white tracking-tighter">${formatCurrency(allocated)}</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] opacity-60">累计盈亏净额</p>
                      <div className="flex flex-col">
                        <p className={`text-3xl font-black tracking-tighter ${pnl >= 0 ? "text-success" : "text-danger"}`}>
                          {allocated > 0 ? (pnl >= 0 ? "+" : "") + formatCurrency(pnl) : "$0.00"}
                        </p>
                        {allocated > 0 && (
                          <span className={`text-[12px] font-black mt-1 ${pnl >= 0 ? "text-success" : "text-danger"}`}>
                             ROI: {((pnl / (allocated || 1)) * 100).toFixed(2)}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => toggleStrategy(strategy.id, isActive)}
                      disabled={isToggling}
                      className={`relative flex items-center justify-center gap-4 px-12 py-6 rounded-[2.5rem] font-black text-[12px] uppercase tracking-[0.2em] transition-all overflow-hidden active:scale-95 shadow-2xl ${
                        isActive
                          ? "bg-danger/10 text-danger hover:bg-danger/20 border border-danger/20 shadow-danger/5"
                          : "bg-success/10 text-success hover:bg-success/20 border border-success/20 shadow-success/5"
                      } ${isToggling ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      {isToggling ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : isActive ? (
                        <><Square className="w-5 h-5 fill-current" /> 停止策略</>
                      ) : (
                        <><Play className="w-5 h-5 fill-current" /> 启动策略</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
              
              {/* 活跃状态流光条 - 增强动效 */}
              {isActive && (
                <div className="h-1.5 w-full bg-accent/5 relative overflow-hidden rounded-b-[3.5rem]">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent to-transparent w-1/2 animate-flow shadow-glow" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style jsx global>{`
        @keyframes flow {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
        .animate-flow { animation: flow 3s infinite linear; }
        .animate-spin-slow { animation: spin 4s infinite linear; }
        .shadow-glow { box-shadow: 0 0 15px rgba(99, 102, 241, 0.5); }
      `}</style>
    </div>
  );
}

interface StatBoxProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
  isTrend?: boolean;
  color?: 'success' | 'danger';
}

function StatBox({ label, value, icon, isTrend, color }: StatBoxProps) {
  return (
    <div className="space-y-2 group/stat">
      <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] group-hover/stat:text-accent transition-colors">{label}</p>
      <div className="flex items-center gap-4">
        {icon}
        <p className={`text-4xl font-black tracking-tighter transition-transform group-hover/stat:scale-105 origin-left ${
          color === 'success' ? 'text-success' : color === 'danger' ? 'text-danger' : 'text-white'
        }`}>
          {value}
        </p>
      </div>
    </div>
  );
}
