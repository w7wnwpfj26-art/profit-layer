"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Activity,
  Database,
  Cpu,
  Wifi,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Server,
  Zap,
  HardDrive,
  BarChart3,
  Loader2,
} from "lucide-react";
import { apiFetch, safeNum } from "../lib/api";
import { PageSkeleton } from "../components/Skeleton";
import { FeedbackBar } from "../components/FeedbackBar";

interface SystemMetric {
  status: string;
  [key: string]: unknown;
}

interface DataSource {
  name: string;
  status: string;
  latency: number;
  lastSync: string;
}

interface OpsData {
  business: {
    pools: { total_pools?: number; total_tvl?: number; avg_apr?: number; low_health_pools?: number };
    positions: { active_positions?: number; total_value?: number; total_pnl?: number };
    alerts: { total_alerts?: number; triggered?: number; critical?: number };
    transactions: { total_tx?: number; total_volume?: number; total_gas?: number };
  };
  system: Record<string, SystemMetric>;
  dataSources: DataSource[];
  timestamp: string;
}

const STATUS_COLORS: Record<string, string> = {
  healthy: "text-success bg-success/10 border-success/20",
  online: "text-success bg-success/10 border-success/20",
  degraded: "text-warning bg-warning/10 border-warning/20",
  offline: "text-danger bg-danger/10 border-danger/20",
  error: "text-danger bg-danger/10 border-danger/20",
};

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
  } catch {
    return "--:--:--";
  }
}

export default function OpsPage() {
  const [data, setData] = useState<OpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(30);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isInitial?: boolean) => {
    if (isInitial) setLoading(true);
    const result = await apiFetch<OpsData>("/api/ops");
    if (result.ok) {
      setData(result.data);
      setError(null);
    } else {
      setError(result.error);
      setData(null);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          fetchData();
          return 30;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    setCountdown(30);
    fetchData();
  };

  if (loading && !data) {
    return <PageSkeleton />;
  }

  // API 失败或无数据：完整占位页，避免“空白”
  if (!data) {
    return (
      <div className="relative min-h-screen">
        <div className="bg-grid" />
        <div className="space-y-8 pb-20 animate-in fade-in duration-700 relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-4xl font-black text-white tracking-tight font-outfit">
                运维<span className="text-gradient-accent">监控</span>
              </h2>
              <p className="text-muted text-sm mt-1">业务指标与系统健康状态</p>
            </div>
          </div>

          {error && (
            <FeedbackBar
              message={error}
              variant="error"
              onDismiss={() => setError(null)}
              autoDismissMs={0}
            />
          )}

          <div className="glass glass-hover rounded-[24px] p-16 border border-white/5 text-center shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-b from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
            
            <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center mx-auto mb-8 relative group-hover:scale-110 transition-transform duration-700">
              <div className="absolute inset-0 rounded-3xl bg-accent/20 blur-xl animate-pulse" />
              <Server className="w-10 h-10 text-accent relative z-10" />
            </div>
            
            <h3 className="text-white font-black text-2xl uppercase tracking-[0.2em] mb-4 font-outfit">数据源未就绪</h3>
            <p className="text-muted text-sm max-w-md mx-auto mb-10 leading-relaxed">
              系统正在等待后端服务响应。请确认数据库已正确配置且 <code className="text-accent/80 font-mono bg-accent/10 px-1.5 py-0.5 rounded">/api/ops</code> 接口可正常访问。
            </p>
            
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-3 px-8 py-4 rounded-[24px] bg-accent/10 border border-accent/20 text-accent text-xs font-black uppercase tracking-[0.2em] hover:bg-accent/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
            >
              {refreshing ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
              {refreshing ? "正在尝试连接..." : "重新尝试连接"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      {/* 动态网格背景 */}
      <div className="bg-grid" />
      
      <div className="space-y-10 pb-20 animate-in fade-in duration-700 stagger-in relative z-10">
        {/* 标题与刷新 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="text-5xl font-black text-white tracking-tight font-outfit uppercase">
              运维<span className="text-gradient-accent">监控</span>
            </h2>
            <p className="text-muted-strong text-xs font-bold mt-3 flex items-center gap-2 uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              业务指标 + 系统指标联动 · 每 30s 自动刷新
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-3 glass glass-hover px-6 py-3 rounded-[24px] border border-white/5 hover:border-accent/30 transition-all text-xs font-black text-muted hover:text-white uppercase tracking-widest disabled:opacity-50 group"
          >
            {refreshing ? (
              <Loader2 className="w-4 h-4 animate-spin text-accent" />
            ) : (
              <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-700" />
            )}
            <span className="font-outfit tracking-wider">{refreshing ? "刷新中" : `${countdown}s 后刷新`}</span>
          </button>
        </div>

        {error && (
          <FeedbackBar message={error} variant="error" onDismiss={() => setError(null)} autoDismissMs={5000} />
        )}

        {/* 核心业务指标 */}
        <section>
          <h3 className="text-white font-black uppercase tracking-[0.3em] text-[10px] flex items-center gap-2 mb-6 opacity-60">
            <BarChart3 className="w-4 h-4 text-accent" /> Business Metrics
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricCard
              icon={<Activity className="w-5 h-5" />}
              label="活跃池子"
              value={Number(data.business.pools?.total_pools) || 0}
              sub={`TVL $${safeNum((Number(data.business.pools?.total_tvl) || 0) / 1e9)}B`}
              accentColor="blue"
            />
            <MetricCard
              icon={<TrendingUp className="w-5 h-5" />}
              label="平均 APR"
              value={`${Number(data.business.pools?.avg_apr) || 0}%`}
              sub={`${Number(data.business.pools?.low_health_pools) || 0} 个低健康分`}
              subColor={(data.business.pools?.low_health_pools ?? 0) > 0 ? "text-warning" : undefined}
              accentColor="green"
            />
            <MetricCard
              icon={<Database className="w-5 h-5" />}
              label="活跃持仓"
              value={Number(data.business.positions?.active_positions) || 0}
              sub={`总值 $${(Number(data.business.positions?.total_value) || 0).toLocaleString()}`}
              accentColor="purple"
            />
            <MetricCard
              icon={<AlertTriangle className="w-5 h-5" />}
              label="24h 告警"
              value={Number(data.business.alerts?.total_alerts) || 0}
              sub={`${Number(data.business.alerts?.critical) || 0} 个严重`}
              subColor={(data.business.alerts?.critical ?? 0) > 0 ? "text-danger" : undefined}
              accentColor="orange"
            />
          </div>
        </section>

        {/* 系统服务状态 */}
        <section>
          <h3 className="text-white font-black uppercase tracking-[0.3em] text-[10px] flex items-center gap-2 mb-6 opacity-60">
            <Server className="w-4 h-4 text-accent" /> System Services
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <SystemCard
              name="Scanner"
              icon={<Cpu className="w-5 h-5 text-accent" />}
              status={String(data.system?.scanner?.status || "unknown")}
              metrics={[
                { label: "平均延迟", value: `${Number(data.system?.scanner?.avgLatency) || 0}ms` },
                { label: "周期错误率", value: `${safeNum(data.system?.scanner?.errorRate)}%` },
              ]}
            />
            <SystemCard
              name="Executor"
              icon={<Zap className="w-5 h-5 text-warning" />}
              status={String(data.system?.executor?.status || "unknown")}
              metrics={[
                { label: "待处理任务", value: `${Number(data.system?.executor?.pendingTx) ?? 0}` },
                { label: "执行成功率", value: `${Number(data.system?.executor?.successRate) ?? 0}%` },
              ]}
            />
            <SystemCard
              name="Database"
              icon={<HardDrive className="w-5 h-5 text-success" />}
              status={String(data.system?.database?.status || "unknown")}
              metrics={[
                { label: "活跃连接", value: `${Number(data.system?.database?.connections) ?? 0}` },
                { label: "平均响应", value: `${Number(data.system?.database?.queryLatency) ?? 0}ms` },
              ]}
            />
            <SystemCard
              name="API Edge"
              icon={<Wifi className="w-5 h-5 text-accent" />}
              status={String(data.system?.api?.status || "unknown")}
              metrics={[
                { label: "请求频率", value: `${Number(data.system?.api?.requestsPerMin) ?? 0} rpm` },
                { label: "P99 响应", value: `${Number(data.system?.api?.avgResponseTime) ?? 0}ms` },
              ]}
            />
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 数据源详情 */}
          <div className="glass glass-hover rounded-[24px] p-8 border border-white/5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-48 h-48 bg-accent/5 blur-[100px] -mr-24 -mt-24 pointer-events-none group-hover:opacity-100 opacity-50 transition-opacity duration-1000" />
            
            <h3 className="text-white font-black uppercase tracking-[0.2em] text-xs flex items-center gap-3 mb-8 relative z-10">
              <div className="p-2 rounded-lg bg-accent/10 border border-accent/20">
                <Wifi className="w-4 h-4 text-accent" />
              </div>
              Nodes & Data Sources
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
              {(data.dataSources || []).map((source) => (
                <div
                  key={source.name}
                  className="p-5 rounded-2xl bg-white/5 border border-white/5 hover:border-accent/20 hover:bg-white/[0.08] transition-all group/source"
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-black text-white font-outfit uppercase tracking-tight">{source.name}</span>
                    <span className={`text-[10px] px-2.5 py-1 rounded-full border font-black uppercase tracking-wider ${STATUS_COLORS[source.status] ?? "text-muted bg-white/5 border-white/10"}`}>
                      {source.status === "online" ? "ONLINE" : "OFFLINE"}
                    </span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-muted font-bold uppercase tracking-tight">Latency</span>
                      <span className="text-xs font-outfit text-white font-black">{source.latency}ms</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden p-[0.5px] ring-1 ring-white/5 shadow-inner">
                      <div 
                        className="h-full bg-accent transition-all duration-1000 rounded-full shadow-[0_0_8px_rgba(14,165,233,0.3)]" 
                        style={{ width: `${Math.max(10, 100 - source.latency / 10)}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center pt-1">
                      <span className="text-[10px] text-muted font-bold uppercase tracking-tight">Last Sync</span>
                      <span className="text-[10px] font-outfit text-muted-strong font-black">{formatTime(source.lastSync)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 交易统计 */}
          <div className="glass glass-hover rounded-[24px] p-8 border border-white/5 flex flex-col relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-48 h-48 bg-success/5 blur-[100px] -ml-24 -mt-24 pointer-events-none group-hover:opacity-100 opacity-50 transition-opacity duration-1000" />
            
            <h3 className="text-white font-black uppercase tracking-[0.2em] text-xs flex items-center gap-3 mb-8 relative z-10">
              <div className="p-2 rounded-lg bg-success/10 border border-success/20">
                <Clock className="w-4 h-4 text-success" />
              </div>
              24h Transaction Stats
            </h3>
            <div className="grid grid-cols-1 gap-5 flex-grow relative z-10">
              <div className="flex items-center justify-between p-6 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/[0.08] hover:border-accent/20 transition-all group/tx">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-accent/10 border border-accent/20 group-hover/tx:scale-110 group-hover/tx:rotate-3 transition-transform duration-500">
                    <Zap className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <div className="text-[10px] text-muted font-black uppercase tracking-[0.2em]">Total Transactions</div>
                    <div className="text-2xl font-black text-white font-outfit tracking-tight">{Number(data.business.transactions?.total_tx).toLocaleString() || 0}</div>
                  </div>
                </div>
                <div className="text-xs font-bold text-success">+12.5%</div>
              </div>
              
              <div className="flex items-center justify-between p-6 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/[0.08] hover:border-success/20 transition-all group/tx">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-success/10 border border-success/20 group-hover/tx:scale-110 group-hover/tx:rotate-3 transition-transform duration-500">
                    <TrendingUp className="w-6 h-6 text-success" />
                  </div>
                  <div>
                    <div className="text-[10px] text-muted font-black uppercase tracking-[0.2em]">Volume (USD)</div>
                    <div className="text-2xl font-black text-white font-outfit tracking-tight">
                      ${(Number(data.business.transactions?.total_volume) || 0).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="text-xs font-bold text-success">+8.2%</div>
              </div>

              <div className="flex items-center justify-between p-6 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/[0.08] hover:border-warning/20 transition-all group/tx">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-warning/10 border border-warning/20 group-hover/tx:scale-110 group-hover/tx:rotate-3 transition-transform duration-500">
                    <Activity className="w-6 h-6 text-warning" />
                  </div>
                  <div>
                    <div className="text-[10px] text-muted font-black uppercase tracking-[0.2em]">Gas Consumed</div>
                    <div className="text-2xl font-black text-white font-outfit tracking-tight">
                      ${safeNum(data.business.transactions?.total_gas)}
                    </div>
                  </div>
                </div>
                <div className="text-xs font-bold text-muted-strong">Stable</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  sub,
  subColor,
  accentColor = "blue",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
  subColor?: string;
  accentColor?: "blue" | "green" | "purple" | "orange";
}) {
  const accents = {
    blue: "text-accent bg-accent/10 border-accent/20 shadow-accent/5",
    green: "text-success bg-success/10 border-success/20 shadow-success/5",
    purple: "text-purple-400 bg-purple-400/10 border-purple-400/20 shadow-purple-400/5",
    orange: "text-warning bg-warning/10 border-warning/20 shadow-warning/5",
  };

  return (
    <div className="glass glass-hover p-7 rounded-[24px] border border-white/5 relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/5 to-transparent rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700" />
      
      <div className="flex items-center gap-3 text-muted mb-5 relative z-10">
        <div className={`p-2.5 rounded-xl border ${accents[accentColor]} transition-all duration-500 group-hover:scale-110 group-hover:rotate-3`}>
          {icon}
        </div>
        <span className="text-[10px] font-black uppercase tracking-[0.2em]">{label}</span>
      </div>
      
      <div className="text-4xl font-black text-white font-outfit tracking-tighter mb-3 group-hover:translate-x-1 transition-transform relative z-10">
        {value}
      </div>
      
      <div className={`text-[10px] font-bold flex items-center gap-1.5 relative z-10 ${subColor ?? "text-muted-strong"}`}>
        <span className="w-1 h-1 rounded-full bg-current opacity-40" />
        {sub}
      </div>
    </div>
  );
}

function SystemCard({
  name,
  icon,
  status,
  metrics,
}: {
  name: string;
  icon: React.ReactNode;
  status: string;
  metrics: { label: string; value: string }[];
}) {
  const isHealthy = status === "healthy" || status === "online";
  
  return (
    <div className="glass glass-hover p-7 rounded-[24px] border border-white/5 relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-white/5 to-transparent rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-700" />
      
      <div className="flex items-center justify-between mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 group-hover:border-accent/30 transition-all duration-500 group-hover:scale-110 group-hover:rotate-3">
            {icon}
          </div>
          <span className="text-sm font-black text-white font-outfit tracking-wider uppercase">{name}</span>
        </div>
        <div className={`relative flex items-center justify-center`}>
          {isHealthy && (
            <span className="absolute inset-0 rounded-full bg-success/20 animate-ping" />
          )}
          <span className={`relative flex items-center gap-1.5 text-[9px] font-black px-3 py-1.5 rounded-full border uppercase tracking-wider ${STATUS_COLORS[status] ?? "text-muted bg-white/5 border-white/10"}`}>
            {isHealthy ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
            {status === "healthy" ? "运行正常" : status}
          </span>
        </div>
      </div>
      
      <div className="space-y-3 mb-4 relative z-10">
        {metrics.map((m) => (
          <div key={m.label} className="flex justify-between items-end">
            <span className="text-[10px] text-muted-strong font-bold uppercase tracking-tight">{m.label}</span>
            <span className="text-sm font-outfit text-white font-black tracking-tight">{m.value}</span>
          </div>
        ))}
      </div>
      
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden p-[0.5px] ring-1 ring-white/5 shadow-inner relative z-10">
        <div 
          className={`h-full transition-all duration-1000 rounded-full ${isHealthy ? "bg-success shadow-[0_0_12px_rgba(16,185,129,0.5)]" : "bg-warning/50"}`}
          style={{ width: isHealthy ? "100%" : "60%" }}
        />
      </div>
    </div>
  );
}
