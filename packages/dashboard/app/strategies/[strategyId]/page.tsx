"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  PieChart,
  BarChart3,
  Shield,
  Target,
  Clock,
  DollarSign,
  Percent,
  Activity,
  CheckCircle,
  Info,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";

interface StrategyExplain {
  strategy: {
    strategyId: string;
    name: string;
    description: string;
    riskLevel: string;
    enabled: boolean;
  };
  lastRebalance?: {
    message: string;
    createdAt: string;
    source: string;
  } | null;
  positionStats: {
    totalPositions: number;
    activePositions: number;
    closedPositions: number;
    currentValue: number;
    totalRealizedPnl: number;
    totalUnrealizedPnl: number;
    avgHoldingDays: number;
  };
  backtestSummary: {
    period: string;
    initialCapital: number;
    finalValue: number;
    totalReturn: number;
    annualizedReturn: number;
    maxDrawdown: number;
    sharpeRatio: number;
    winRate: number;
    profitFactor: number;
    totalTrades: number;
    avgTradeReturn: number;
  };
  riskFactors: { name: string; exposure: number; description: string }[];
  revenueBreakdown: { source: string; percentage: number; description: string }[];
  suitableAssets: string[];
  assumptions: string[];
}

const RISK_COLORS: Record<string, string> = {
  low: "text-success bg-success/10",
  medium: "text-warning bg-warning/10",
  high: "text-danger bg-danger/10",
};

export default function StrategyExplainPage() {
  const params = useParams();
  const router = useRouter();
  const strategyId = params?.strategyId as string;
  const [data, setData] = useState<StrategyExplain | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!strategyId) return;
    fetch(`/api/strategies/${strategyId}/explain`)
      .then((res) => res.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [strategyId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Activity className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted">策略不存在</p>
        <Link href="/strategies" className="text-accent text-sm mt-2 inline-block">
          返回策略列表
        </Link>
      </div>
    );
  }

  const { strategy, lastRebalance, positionStats, backtestSummary, riskFactors, revenueBreakdown, suitableAssets, assumptions } = data;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-white/5 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-black text-foreground">{strategy.name}</h1>
          <p className="text-xs text-muted">{strategy.description}</p>
        </div>
        <span className={`px-3 py-1 rounded-lg text-xs font-bold ${RISK_COLORS[strategy.riskLevel] || RISK_COLORS.medium}`}>
          {strategy.riskLevel === "low" ? "低风险" : strategy.riskLevel === "high" ? "高风险" : "中风险"}
        </span>
      </div>

      {/* Position Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Target className="w-4 h-4" />} label="总持仓数" value={positionStats.totalPositions} />
        <StatCard icon={<Activity className="w-4 h-4" />} label="活跃持仓" value={positionStats.activePositions} />
        <StatCard
          icon={<DollarSign className="w-4 h-4" />}
          label="当前价值"
          value={`$${positionStats.currentValue.toLocaleString()}`}
        />
        <StatCard
          icon={<Clock className="w-4 h-4" />}
          label="平均持仓天数"
          value={`${positionStats.avgHoldingDays.toFixed(1)} 天`}
        />
      </div>

      {/* 最近一次调仓原因 */}
      {lastRebalance && (
        <div className="p-6 rounded-xl glass border border-white/5">
          <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-accent" /> 最近一次调仓原因
          </h2>
          <p className="text-sm text-white/90 mb-2">{lastRebalance.message}</p>
          <p className="text-[10px] text-muted">
            {new Date(lastRebalance.createdAt).toLocaleString("zh-CN")} · 来源:{" "}
            {lastRebalance.source === "dashboard" ? "手动" : lastRebalance.source === "executor" ? "执行器" : lastRebalance.source}
          </p>
        </div>
      )}

      {/* Backtest Summary */}
      <div className="p-6 rounded-xl bg-card border border-border">
        <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-accent" /> 回测摘要
        </h2>
        <p className="text-[10px] text-muted mb-4">回测周期: {backtestSummary.period}</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center">
            <div className={`text-xl font-black ${backtestSummary.totalReturn >= 0 ? "text-success" : "text-danger"}`}>
              {backtestSummary.totalReturn >= 0 ? "+" : ""}{backtestSummary.totalReturn}%
            </div>
            <div className="text-[10px] text-muted">总收益率</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-black text-danger">{backtestSummary.maxDrawdown}%</div>
            <div className="text-[10px] text-muted">最大回撤</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-black text-foreground">{backtestSummary.sharpeRatio}</div>
            <div className="text-[10px] text-muted">夏普比率</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-black text-success">{backtestSummary.winRate}%</div>
            <div className="text-[10px] text-muted">胜率</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-black text-foreground">{backtestSummary.profitFactor}</div>
            <div className="text-[10px] text-muted">盈亏比</div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Risk Factors */}
        <div className="p-6 rounded-xl bg-card border border-border">
          <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" /> 风险因子分析
          </h2>
          <div className="space-y-3">
            {riskFactors.map((rf) => (
              <div key={rf.name}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium">{rf.name}</span>
                  <span className={rf.exposure >= 50 ? "text-danger" : rf.exposure >= 30 ? "text-warning" : "text-success"}>
                    {rf.exposure}%
                  </span>
                </div>
                <div className="h-2 bg-border rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      rf.exposure >= 50 ? "bg-danger" : rf.exposure >= 30 ? "bg-warning" : "bg-success"
                    }`}
                    style={{ width: `${rf.exposure}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted mt-1">{rf.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Revenue Breakdown */}
        <div className="p-6 rounded-xl bg-card border border-border">
          <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-success" /> 收益来源分解
          </h2>
          <div className="space-y-3">
            {revenueBreakdown.map((rb, i) => (
              <div key={rb.source} className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6"][i] }}
                />
                <div className="flex-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium">{rb.source}</span>
                    <span className="text-accent">{rb.percentage}%</span>
                  </div>
                  <p className="text-[10px] text-muted">{rb.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Suitable Assets & Assumptions */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="p-6 rounded-xl bg-card border border-border">
          <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-accent" /> 适用资产
          </h2>
          <div className="flex flex-wrap gap-2">
            {suitableAssets.map((asset) => (
              <span key={asset} className="px-3 py-1 rounded-lg bg-accent/10 text-accent text-xs font-bold">
                {asset}
              </span>
            ))}
          </div>
        </div>

        <div className="p-6 rounded-xl bg-card border border-border">
          <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
            <Info className="w-4 h-4 text-info" /> 关键假设
          </h2>
          <ul className="space-y-2">
            {assumptions.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted">
                <CheckCircle className="w-3.5 h-3.5 text-success mt-0.5 flex-shrink-0" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="p-4 rounded-xl bg-card border border-border">
      <div className="flex items-center gap-2 text-muted mb-2">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-xl font-black text-foreground">{value}</div>
    </div>
  );
}
