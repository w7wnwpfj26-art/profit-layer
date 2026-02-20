"use client";

import React, { useEffect, useState } from "react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
  AreaChart, Area,
} from "recharts";
import { 
  TrendingUp, 
  Coins, 
  ShieldCheck, 
  Activity, 
  Clock, 
  ArrowUpRight,
  RefreshCcw,
  ExternalLink,
  DollarSign,
  BarChart3,
  Briefcase,
  BrainCircuit,
} from "lucide-react";
import { NewUserGuide, GlossaryPanel } from "@/components/NewUserGuide";
import { PageHeaderSkeleton, StatGridSkeleton, TableSkeleton, CardSkeleton } from "@/app/components/LoadingSkeleton";
import Link from "next/link";

interface Stats {
  lastUpdated: string | null;
  dataAgeSec: number;
  overview: {
    totalPools: number;
    totalProtocols: number;
    totalChains: number;
    totalTvlUsd: number;
    avgApr: number;
    medianApr: number;
    avgHealthScore?: number | null;
    healthyPoolsCount?: number | null;
  };
  chainAllocation: { chain: string; poolCount: number; tvlUsd: number; avgApr: number }[];
  topProtocols: { protocolId: string; poolCount: number; tvlUsd: number }[];
  topPools: { poolId: string; protocolId: string; chain: string; symbol: string; aprTotal: number; tvlUsd: number; volume24hUsd: number; healthScore?: number | null }[];
}

interface Transaction {
  txType: string;
  amountUsd: number;
  chain: string;
  createdAt: string;
}

interface StrategyBreakdown {
  strategyId: string;
  strategyName: string;
  positionCount: number;
  totalAllocatedUsd: number;
  totalPnlUsd: number;
}

interface ProfitData {
  totalValue: number;
  totalPnl: number;
  realizedPnl: number;
  count: number;
  recentTransactions: Transaction[];
  strategyBreakdown: StrategyBreakdown[];
}

interface SentimentData {
  offline?: boolean;
  compositeScore?: number;
  marketRegime?: string;
  fearGreedIndex?: number;
  fearGreedLabel?: string;
  btcPrice?: number;
  btc24hChange?: number;
  ethPrice?: number;
  eth24hChange?: number;
  gasGwei?: { ethereum: number };
  suggestion?: string;
}

interface ThinkLog {
  cycleId: string;
  inputSummary: string;
  durationMs: number;
  outputSummary: string;
  createdAt: string;
  actionsTaken: number;
}

interface StatCardProps {
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  trend?: string;
  color: "accent" | "success" | "warning" | "danger";
}

function formatAge(sec: number): string {
  if (sec < 60) return `${sec}秒`;
  if (sec < 3600) return `${Math.floor(sec / 60)}分`;
  return `${Math.floor(sec / 3600)}时`;
}

const CHAIN_COLORS: Record<string, string> = {
  ethereum: "#6366f1", arbitrum: "#28A0F0", bsc: "#F0B90B",
  polygon: "#8247E5", base: "#0052FF", optimism: "#FF0420",
  avalanche: "#E84142", aptos: "#2DD8A7", solana: "#9945FF", sui: "#4DA2FF",
};

const TX_TYPE_LABELS: Record<string, string> = {
  swap: "兑换",
  add_liquidity: "添加流动性",
  remove_liquidity: "移除流动性",
  harvest: "提取收益",
  compound: "复投",
  enter: "入场",
  exit: "退出",
  deposit: "存入",
  withdraw: "取出",
  wrap: "包装",
  unwrap: "解包",
  approve: "授权",
  stake: "质押",
  unstake: "取消质押",
  rebalance: "再平衡",
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [profitData, setProfitData] = useState<ProfitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshCountdown, setRefreshCountdown] = useState(60);

  const fetchStats = () => {
    fetch("/api/stats")
      .then((res) => { if (!res.ok) throw new Error("API error"); return res.json(); })
      .then((data) => { setStats(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  const fetchProfit = () => {
    fetch("/api/positions")
      .then((res) => { if (!res.ok) throw new Error("API error"); return res.json(); })
      .then((data) => {
        setProfitData({
          totalValue: data.totalValue ?? 0,
          totalPnl: data.totalPnl ?? 0,
          realizedPnl: data.totalRealizedPnl ?? 0,
          count: data.count ?? 0,
          recentTransactions: (data.recentTransactions ?? []).slice(0, 5).map((t: Transaction) => ({
            txType: t.txType,
            amountUsd: t.amountUsd,
            chain: t.chain,
            createdAt: t.createdAt,
          })),
          strategyBreakdown: (data.strategyBreakdown ?? []).map((s: StrategyBreakdown) => ({
            strategyId: s.strategyId,
            strategyName: s.strategyName,
            positionCount: s.positionCount,
            totalAllocatedUsd: s.totalAllocatedUsd,
            totalPnlUsd: s.totalPnlUsd,
          })),
        });
      })
      .catch(() => setProfitData(null));
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchProfit();
    const interval = setInterval(fetchProfit, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setRefreshCountdown(60);
    const timer = setInterval(() => {
      setRefreshCountdown((c) => (c <= 1 ? 60 : c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [stats]);

  if (loading) return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <PageHeaderSkeleton />
      <StatGridSkeleton />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <TableSkeleton />
    </div>
  );
  if (!stats) return (
    <div className="glass p-8 rounded-2xl text-danger border border-danger/20 text-center space-y-3">
      <p className="font-medium">数据库连接异常，请检查后端状态。</p>
      <p className="text-sm text-muted max-w-md mx-auto">
        请确认：1) PostgreSQL 已启动（如执行 <code className="bg-black/20 px-1 rounded">docker compose up -d timescaledb</code>）；
        2) 项目根目录 <code className="bg-black/20 px-1 rounded">.env</code> 中 <code className="bg-black/20 px-1 rounded">POSTGRES_HOST</code>、<code className="bg-black/20 px-1 rounded">POSTGRES_PORT</code>（默认 5433）与数据库一致。
      </p>
    </div>
  );

  const { overview, chainAllocation, topPools, topProtocols } = stats;

  const pieData = chainAllocation.map((c) => ({
    name: c.chain,
    value: c.tvlUsd,
    color: CHAIN_COLORS[c.chain] || "#444",
  }));

  const barData = topProtocols.slice(0, 8).map((p) => ({
    name: p.protocolId,
    tvl: p.tvlUsd / 1e9,
  }));

  return (
    <div className="space-y-10 pb-16">
      <NewUserGuide />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black text-white tracking-tight font-outfit uppercase">
            核心<span className="text-gradient-accent">仪表盘</span>
          </h2>
          <div className="flex flex-wrap items-center gap-4 mt-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 border border-success/20 shadow-lg shadow-success/5">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-[10px] font-black text-success uppercase tracking-widest">实时同步中</span>
            </div>
            <p className="text-muted-strong text-[11px] font-bold flex items-center gap-2 uppercase tracking-wider">
              <Clock className="w-3.5 h-3.5 text-accent" /> 
              {formatAge(stats.dataAgeSec)} 前更新 · <span className="text-accent">{refreshCountdown}s</span> 后自动同步
            </p>
            <GlossaryPanel />
          </div>
        </div>
        <button 
          onClick={fetchStats} 
          className="flex items-center gap-2 px-6 py-3 glass rounded-2xl hover:bg-white/5 transition-all active:scale-95 group border border-white/5 hover:border-accent/30"
        >
          <RefreshCcw className="w-4 h-4 text-muted group-hover:text-accent group-hover:rotate-180 transition-all duration-700" />
          <span className="text-xs font-black text-muted group-hover:text-white uppercase tracking-widest">强制刷新</span>
        </button>
      </div>

      {/* 盈利情况 */}
      <section className="glass rounded-[2.5rem] p-10 border border-white/5 relative overflow-hidden group/profit animate-in slide-in-from-bottom-4 duration-700 delay-100">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-accent/5 blur-[120px] -mr-48 -mt-48 pointer-events-none transition-opacity duration-1000 group-hover/profit:opacity-100 opacity-50" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10 relative z-10">
          <div className="space-y-1">
            <h3 className="text-xs font-black text-white uppercase tracking-[0.3em] flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/10 border border-accent/20">
                <DollarSign className="w-4 h-4 text-accent" /> 
              </div>
              投资组合表现 (Portfolio Performance)
            </h3>
          </div>
          {profitData && (
            <div className="flex items-center gap-2 text-[10px] font-black text-accent uppercase tracking-widest bg-accent/5 px-4 py-2 rounded-full border border-accent/10 shadow-lg shadow-accent/5">
              <Activity className="w-3 h-3 animate-pulse" />
              {profitData.count} 个活跃持仓
            </div>
          )}
        </div>

        {profitData && profitData.count > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <StatCard label="持仓总值" value={`$${profitData.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} sub="当前净值" icon={BarChart3} color="accent" />
            <StatCard label="未实现盈亏" value={`${profitData.totalPnl >= 0 ? "+" : ""}$${profitData.totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} sub="浮动盈亏" icon={TrendingUp} color={profitData.totalPnl >= 0 ? "success" : "danger"} />
            <StatCard label="已实现盈亏" value={`${profitData.realizedPnl >= 0 ? "+" : ""}$${profitData.realizedPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} sub="已实现收益" icon={Coins} color={profitData.realizedPnl >= 0 ? "success" : "danger"} />
            <StatCard label="综合回报" value={`${(profitData.totalPnl + profitData.realizedPnl) >= 0 ? "+" : ""}$${(profitData.totalPnl + profitData.realizedPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} sub="总回报" icon={Activity} color={(profitData.totalPnl + profitData.realizedPnl) >= 0 ? "success" : "danger"} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center bg-white/[0.02] rounded-3xl border border-dashed border-white/5">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <Briefcase className="w-8 h-8 text-muted/30" />
            </div>
            <p className="text-muted font-bold text-sm">暂无活跃持仓，盈利统计将在策略执行后自动生成</p>
            <Link href="/positions" className="mt-6 text-accent text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors flex items-center gap-2 group">
              探索收益机会 <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </Link>
          </div>
        )}

        {profitData && profitData.recentTransactions.length > 0 && (
          <div className="mt-10 pt-10 border-t border-white/5 relative z-10">
            <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] mb-6">最近交易动态 (Recent Activity)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {profitData.recentTransactions.map((tx, i) => (
                <div key={i} className="flex flex-col p-5 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-accent/30 hover:bg-white/[0.05] transition-all group/tx">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-black text-muted-strong uppercase tracking-wider group-hover/tx:text-accent transition-colors">{TX_TYPE_LABELS[tx.txType] || tx.txType}</span>
                    <span className="px-2 py-0.5 rounded bg-white/5 text-[9px] font-mono text-white/40 border border-white/5">{tx.chain}</span>
                  </div>
                  <span className={`text-xl font-black font-outfit ${tx.amountUsd >= 0 ? "text-success" : "text-danger"}`}>
                    {tx.amountUsd >= 0 ? "+" : ""}${Math.abs(tx.amountUsd).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[9px] text-muted-strong font-bold">{new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <div className="w-1 h-1 rounded-full bg-white/10 group-hover/tx:bg-accent animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 animate-in slide-in-from-bottom-4 duration-700 delay-200">
        <StatCard 
          label="全球锁仓总量 (TVL)" 
          value={`$${(overview.totalTvlUsd / 1e9).toFixed(2)}B`} 
          sub={`${overview.totalChains} 条链上数据活跃中`} 
          icon={TrendingUp}
          color="accent"
        />
        <StatCard 
          label="已集成协议" 
          value={overview.totalProtocols.toString()} 
          sub={`全时监控 ${overview.totalPools} 个资产池`} 
          icon={Coins}
          color="success"
        />
        <StatCard 
          label="智能健康评级" 
          value={overview.avgHealthScore?.toFixed(1) || "-"} 
          sub={`${overview.healthyPoolsCount ?? 0} 个低风险资产 (≥60)`} 
          icon={ShieldCheck}
          color="warning"
        />
        <StatCard 
          label="24h 平均年化" 
          value={`${overview.avgApr.toFixed(1)}%`} 
          sub={`市场收益中位数 ${overview.medianApr?.toFixed(1) ?? 0}%`} 
          icon={Activity}
          color="danger"
        />
      </div>

      {/* 市场情绪 + AI 大脑 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in slide-in-from-bottom-4 duration-700 delay-300">
        <SentimentCard />
        <AIBrainCard />
      </div>

      {/* PnL 净值曲线 */}
      <div className="animate-in slide-in-from-bottom-4 duration-700 delay-400">
        <PnlChart />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in slide-in-from-bottom-4 duration-700 delay-500">
        <div className="lg:col-span-2 glass rounded-[2.5rem] p-10 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-96 h-96 bg-accent/5 blur-[120px] -mr-48 -mt-48 pointer-events-none" />
          <h3 className="text-[10px] font-black text-white/30 flex items-center gap-3 uppercase tracking-[0.3em] mb-10">
            <BarChart3 className="w-4 h-4 text-accent" /> 协议 TVL 分布分析 (USD $B)
          </h3>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}B`} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.02)" }}
                  contentStyle={{ background: "rgba(3, 4, 6, 0.95)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "20px", backdropFilter: "blur(20px)", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)" }}
                  itemStyle={{ color: "#fff", fontSize: "12px", fontWeight: 800 }}
                  labelStyle={{ color: "#94a3b8", fontSize: "10px", fontWeight: 800, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.1em" }}
                />
                <Bar dataKey="tvl" fill="url(#barGradient)" radius={[12, 12, 4, 4]} barSize={44} />
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity={1} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass rounded-[2.5rem] p-10 relative overflow-hidden group">
          <h3 className="text-[10px] font-black text-white/30 mb-10 uppercase tracking-[0.3em]">公链分布情况 (Chain Distribution)</h3>
          <div className="h-[240px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={75} outerRadius={105} paddingAngle={10} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} stroke="rgba(255,255,255,0.05)" strokeWidth={3} />
                  ))}
                </Pie>
                <Tooltip 
                   contentStyle={{ background: "rgba(3, 4, 6, 0.95)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "16px", backdropFilter: "blur(20px)" }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] text-muted-strong font-black uppercase tracking-[0.2em] opacity-40">Network总数</span>
              <span className="text-3xl font-black text-white font-outfit">{chainAllocation.length}</span>
              <span className="text-[9px] text-muted-strong uppercase font-black tracking-widest mt-1">Active</span>
            </div>
          </div>
          <div className="mt-10 space-y-4">
            {chainAllocation.slice(0, 5).map((c) => (
              <div key={c.chain} className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] transition-all border border-transparent hover:border-white/5 group/row">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_12px_rgba(0,0,0,0.5)] transition-transform group-hover/row:scale-125" style={{ backgroundColor: CHAIN_COLORS[c.chain] || "#444" }} />
                  <span className="text-white/70 text-[11px] font-black uppercase tracking-wider group-hover/row:text-white transition-colors">{c.chain}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-white font-black font-outfit text-xs">${(c.tvlUsd / 1e9).toFixed(1)}B</span>
                  <span className="text-[9px] text-muted-strong font-bold uppercase">{c.poolCount} Pools</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Pools Table */}
      <div className="glass rounded-[2.5rem] overflow-hidden group border border-white/5 hover:border-white/10 transition-all duration-700 shadow-2xl shadow-black/50 animate-in slide-in-from-bottom-4 duration-700 delay-600">
        <div className="p-10 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white/[0.01]">
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-[0.3em]">Alpha 收益聚合中心 (Alpha Yield Aggregator)</h3>
            <p className="text-[10px] text-muted-strong mt-2 font-bold tracking-[0.1em] uppercase opacity-60">
              高置信度机会 · 锁仓额 {'>'} $1M · 健康评分 {'>'} 60
            </p>
          </div>
          <Link href="/pools" className="px-6 py-3 rounded-2xl bg-accent/10 border border-accent/20 text-[10px] font-black text-accent uppercase tracking-widest hover:bg-accent/20 transition-all text-center shadow-lg shadow-accent/5">
            查看所有机会 (View All)
          </Link>
        </div>
        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/30 text-[10px] font-black uppercase tracking-[0.25em] bg-white/[0.01]">
                <th className="text-left px-10 py-6">资产策略 (Asset Strategy)</th>
                <th className="text-left px-10 py-6">协议与公链 (Network)</th>
                <th className="text-right px-10 py-6">目标年化 (APR)</th>
                <th className="text-right px-10 py-6">安全评级 (Safety)</th>
                <th className="text-right px-10 py-6">流动性 (TVL)</th>
                <th className="px-10 py-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {topPools.map((pool) => (
                <tr key={pool.poolId} className="hover:bg-white/[0.03] transition-all group/tr cursor-default">
                  <td className="px-10 py-8">
                    <div className="flex flex-col">
                      <span className="text-white font-black text-lg font-outfit tracking-tight group-hover/tr:text-accent transition-colors">{pool.symbol}</span>
                      <span className="text-[9px] text-muted-strong font-mono opacity-40 tracking-tighter uppercase mt-1.5">{pool.poolId}</span>
                    </div>
                  </td>
                  <td className="px-10 py-8">
                    <div className="flex items-center gap-4">
                      <span className="text-white font-black uppercase tracking-widest text-[11px] group-hover/tr:text-white transition-colors">{pool.protocolId}</span>
                      <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg" style={{ backgroundColor: (CHAIN_COLORS[pool.chain] || "#444") + "22", color: CHAIN_COLORS[pool.chain] || "#ccc", border: `1px solid ${(CHAIN_COLORS[pool.chain] || "#444") + "44"}` }}>
                        {pool.chain}
                      </span>
                    </div>
                  </td>
                  <td className="px-10 py-8 text-right">
                    <div className="flex flex-col items-end">
                      <span className="text-success font-black text-2xl font-outfit tracking-tighter drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]">{pool.aprTotal.toFixed(1)}%</span>
                      <span className="text-[9px] text-success/40 font-black uppercase tracking-widest mt-1">收益年化</span>
                    </div>
                  </td>
                  <td className="px-10 py-8 text-right">
                    {pool.healthScore != null ? (
                      <div className="flex flex-col items-end gap-3">
                        <div className="flex items-center gap-2">
                           <span className={`text-xs font-black font-outfit ${pool.healthScore >= 70 ? "text-success" : "text-warning"}`}>
                            {pool.healthScore.toFixed(0)}/100
                          </span>
                        </div>
                        <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden p-[1px] ring-1 ring-white/5 shadow-inner">
                          <div className={`h-full rounded-full transition-all duration-1000 ${pool.healthScore >= 70 ? "bg-success shadow-[0_0_12px_rgba(16,185,129,0.5)]" : "bg-warning"}`} style={{ width: `${pool.healthScore}%` }} />
                        </div>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-strong font-black uppercase tracking-widest">未评分</span>
                    )}
                  </td>
                  <td className="px-10 py-8 text-right font-outfit text-sm font-black text-white/60">
                    ${pool.tvlUsd >= 1e9 ? `${(pool.tvlUsd / 1e9).toFixed(2)}B` : `${(pool.tvlUsd / 1e6).toFixed(1)}M`}
                  </td>
                  <td className="px-10 py-8 text-right">
                    <button className="p-3 rounded-2xl bg-white/5 hover:bg-accent text-muted hover:text-white transition-all border border-white/5 hover:border-accent hover:shadow-lg hover:shadow-accent/20">
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SentimentCard() {
  const [data, setData] = useState<SentimentData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch("/api/sentiment")
      .then((r) => {
        if (!r.ok) {
          setFailed(true);
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (d && d.offline) setFailed(true);
        else setData(d);
      })
      .catch(() => setFailed(true));
  }, []);
  if (failed) {
    return (
      <div className="glass rounded-2xl p-6 h-48 flex items-center justify-center text-muted text-xs font-bold uppercase">
        情绪服务不可用
      </div>
    );
  }
  if (!data) return <div className="glass rounded-2xl p-6 h-48 flex items-center justify-center text-muted text-xs font-bold uppercase animate-pulse">加载市场情绪...</div>;

  const score = data.compositeScore ?? 0;
  const color = score <= 30 ? "text-danger" : score <= 60 ? "text-warning" : "text-success";
  const bgColor = score <= 30 ? "from-danger/10" : score <= 60 ? "from-warning/10" : "from-success/10";

  return (
    <div className={`glass rounded-[24px] p-8 bg-gradient-to-br ${bgColor} to-transparent border-white/5 relative overflow-hidden group hover:border-white/10 transition-all duration-500`}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 blur-[40px] -mr-16 -mt-16 pointer-events-none group-hover:bg-white/10 transition-all" />
      <h3 className="text-[11px] font-black text-white/40 mb-6 flex items-center gap-2 uppercase tracking-[0.2em]">
        <Activity className="w-4 h-4 text-accent" /> 市场情绪雷达
      </h3>
      <div className="flex items-center gap-10">
        <div className="text-center relative">
          <div className={`absolute inset-0 blur-2xl opacity-20 ${color.replace('text-', 'bg-')}`} />
          <p className={`text-6xl font-black tracking-tighter relative ${color}`}>{score}</p>
          <p className={`text-[10px] font-black uppercase tracking-widest ${color} mt-2 opacity-80`}>{data.marketRegime ?? "-"}</p>
        </div>
        <div className="flex-1 space-y-4 text-[11px]">
          <div className="flex justify-between items-center"><span className="text-muted font-medium">恐惧贪婪指数</span><span className="text-white font-bold px-2 py-0.5 rounded bg-white/5">{data.fearGreedIndex ?? "-"} ({data.fearGreedLabel ?? "-"})</span></div>
          <div className="flex justify-between items-center"><span className="text-muted font-medium">比特币价格</span><span className={`font-mono font-bold ${(data.btc24hChange ?? 0) >= 0 ? "text-success" : "text-danger"}`}>${(data.btcPrice ?? 0).toLocaleString()}</span></div>
          <div className="flex justify-between items-center"><span className="text-muted font-medium">以太坊价格</span><span className={`font-mono font-bold ${(data.eth24hChange ?? 0) >= 0 ? "text-success" : "text-danger"}`}>${(data.ethPrice ?? 0).toLocaleString()}</span></div>
          <div className="flex justify-between items-center"><span className="text-muted font-medium">网络 Gas</span><span className="text-accent font-bold font-mono">{data.gasGwei?.ethereum ?? "-"} GWEI</span></div>
        </div>
      </div>
      <div className="mt-8 pt-6 border-t border-white/5">
        <p className="text-xs text-muted/80 leading-relaxed italic">“ {data.suggestion ?? ""} ”</p>
      </div>
    </div>
  );
}

function AIBrainCard() {
  const [thinkLogs, setThinkLogs] = useState<ThinkLog[]>([]);
  useEffect(() => { fetch("/api/ai/think-log?limit=3").then(r => { if (!r.ok) throw new Error("API error"); return r.json(); }).then(d => setThinkLogs(d.logs || [])).catch(() => {}); }, []);

  return (
    <div className="glass rounded-[24px] p-8 relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 blur-[40px] -mr-16 -mt-16 pointer-events-none group-hover:bg-accent/10 transition-all" />
      <h3 className="text-[11px] font-black text-white/40 mb-6 flex items-center gap-2 uppercase tracking-[0.2em]">
        <Clock className="w-4 h-4 text-accent" /> AI 认知日志
      </h3>
      {thinkLogs.length === 0 ? (
        <div className="h-40 flex flex-col items-center justify-center text-muted/40 border-2 border-dashed border-white/5 rounded-2xl">
          <BrainCircuit className="w-8 h-8 mb-3 opacity-20" />
          <p className="text-[10px] font-black uppercase tracking-widest">神经链路离线</p>
          <p className="text-[9px] mt-1">等待 AI 引擎初始化...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {thinkLogs.map((log: ThinkLog) => (
            <div key={log.cycleId} className="p-4 rounded-[18px] bg-white/[0.02] border border-white/5 hover:border-accent/30 hover:bg-white/[0.04] transition-all group/item">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-black text-accent uppercase tracking-tighter">{log.inputSummary}</span>
                <span className="text-[9px] font-mono text-muted/50">{log.durationMs}ms</span>
              </div>
              <p className="text-xs text-white/80 font-medium line-clamp-2 leading-relaxed group-hover/item:text-white transition-colors">{log.outputSummary}</p>
              <div className="flex items-center justify-between mt-3">
                <span className="text-[9px] font-bold text-muted/40 uppercase tracking-widest">{new Date(log.createdAt).toLocaleTimeString()}</span>
                {log.actionsTaken > 0 && <span className="px-2 py-0.5 rounded-full bg-success/10 text-success text-[9px] font-black uppercase tracking-tighter">已执行 {log.actionsTaken} 次操作</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PnlChart() {
  const [points, setPoints] = useState<{ time: string; value: number; pnl: number }[]>([]);

  useEffect(() => {
    fetch("/api/pnl?days=7")
      .then(r => { if (!r.ok) throw new Error("API error"); return r.json(); })
      .then(d => setPoints(d.points || []))
      .catch(() => {});
  }, []);

  if (points.length < 2) {
    return (
      <div className="glass-cyber rounded-[2.5rem] p-6 border border-white/5">
        <h3 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-accent" /> 投资组合净值曲线
        </h3>
        <div className="h-[200px] flex items-center justify-center text-muted text-xs font-bold uppercase">
          系统运行后将自动生成净值数据...
        </div>
      </div>
    );
  }

  const lastPnl = points[points.length - 1]?.pnl ?? 0;
  const isPositive = lastPnl >= 0;

  return (
    <div className="glass-cyber rounded-[2.5rem] p-6 border border-white/5 relative overflow-hidden">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-accent" /> 投资组合净值曲线 (7天)
        </h3>
        <span className={`text-xs font-black ${isPositive ? "text-success" : "text-danger"}`}>
          {isPositive ? "+" : ""}${lastPnl.toLocaleString()}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={points} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0.3} />
              <stop offset="100%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
          <XAxis dataKey="time" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => new Date(v).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })} />
          <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.1)", borderRadius: "12px" }} />
          <Area type="monotone" dataKey="value" stroke={isPositive ? "#10b981" : "#ef4444"} fill="url(#pnlGradient)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, trend, color }: StatCardProps) {
  const colorMap: Record<string, string> = {
    accent: "text-accent bg-accent/15 ring-1 ring-accent/30 shadow-[0_0_15px_rgba(14,165,233,0.1)]",
    success: "text-success bg-success/15 ring-1 ring-success/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]",
    warning: "text-warning bg-warning/15 ring-1 ring-warning/30 shadow-[0_0_15px_rgba(245,158,11,0.1)]",
    danger: "text-danger bg-danger/15 ring-1 ring-danger/30 shadow-[0_0_15px_rgba(244,63,94,0.1)]",
  };

  return (
    <div className="glass glass-hover p-7 rounded-[24px] relative overflow-hidden group">
      <div className="flex justify-between items-start mb-6">
        <div className={`p-3.5 rounded-2xl ${colorMap[color]} transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3`}>
          <Icon className="w-6 h-6" strokeWidth={1.5} />
        </div>
        {trend && (
          <span className="text-[11px] font-bold text-success bg-success/15 px-2.5 py-1.2 rounded-full ring-1 ring-success/20">
            {trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-[11px] font-bold text-muted uppercase tracking-[0.2em] mb-2 opacity-60 group-hover:opacity-100 transition-opacity">{label}</p>
        <p className="text-3xl font-extrabold text-white tracking-tight leading-none mb-4 group-hover:text-accent transition-colors">{value}</p>
        <div className="flex items-center gap-2">
          <div className="w-1 h-1 rounded-full bg-white/20" />
          <p className="text-[11px] font-medium text-muted/80">{sub}</p>
        </div>
      </div>
    </div>
  );
}
