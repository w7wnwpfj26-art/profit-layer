"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Server,
  Database,
  Cpu,
  HardDrive,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Zap,
  BarChart3,
} from "lucide-react";
import { apiFetch } from "../lib/api";
import { PageSkeleton } from "../components/Skeleton";
import { FeedbackBar } from "../components/FeedbackBar";

interface Metrics {
  business: {
    active_pools: number;
    active_positions: number;
    total_position_value: number;
    total_unrealized_pnl: number;
    tx_24h: number;
    inflow_24h: number;
    outflow_24h: number;
  };
  alerts: {
    active_alerts: number;
    critical_alerts: number;
    alerts_1h: number;
  };
  anomalies: {
    active_anomalies: number;
    anomalies_1h: number;
  };
  sources: Array<{
    source_id: string;
    name: string;
    health_status: string;
    error_count: number;
  }>;
  system: {
    uptime_hours: number;
    memory_usage_pct: number;
    cpu_usage_pct: number;
    db_connections: number;
    api_latency_ms: number;
  };
  timestamp: string;
}

export default function MonitorPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadMetrics = async () => {
    const result = await apiFetch<Metrics>("/api/metrics");
    if (result.ok) {
      setMetrics(result.data);
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadMetrics();
    if (autoRefresh) {
      const interval = setInterval(loadMetrics, 10000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  if (loading || !metrics) {
    return <PageSkeleton />;
  }

  const b = metrics.business;
  const netFlow = Number(b.inflow_24h) - Number(b.outflow_24h);

  return (
    <div className="space-y-8 pb-20">
      {/* 错误提示 */}
      <FeedbackBar message={error} variant="error" onDismiss={() => setError(null)} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-accent/10 border border-accent/20">
            <Activity className="w-8 h-8 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">运维监控</h1>
            <p className="text-xs text-muted">业务指标 + 系统指标 实时联动</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            自动刷新
          </label>
          <button
            onClick={loadMetrics}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-sm text-white"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Business Metrics */}
      <div>
        <h2 className="text-sm font-bold text-muted mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4" /> 业务指标
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass p-4 rounded-2xl border-white/5">
            <p className="text-[10px] text-muted uppercase tracking-widest">活跃池子</p>
            <p className="text-2xl font-black text-white mt-1">{b.active_pools}</p>
          </div>
          <div className="glass p-4 rounded-2xl border-white/5">
            <p className="text-[10px] text-muted uppercase tracking-widest">活跃持仓</p>
            <p className="text-2xl font-black text-white mt-1">{b.active_positions}</p>
          </div>
          <div className="glass p-4 rounded-2xl border-white/5">
            <p className="text-[10px] text-muted uppercase tracking-widest">持仓总值</p>
            <p className="text-2xl font-black text-accent mt-1">${Number(b.total_position_value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="glass p-4 rounded-2xl border-white/5">
            <p className="text-[10px] text-muted uppercase tracking-widest">未实现盈亏</p>
            <p className={`text-2xl font-black mt-1 ${Number(b.total_unrealized_pnl) >= 0 ? "text-success" : "text-danger"}`}>
              {Number(b.total_unrealized_pnl) >= 0 ? "+" : ""}${Number(b.total_unrealized_pnl).toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Flow Metrics */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="glass p-4 rounded-2xl border-white/5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-success" />
            <span className="text-xs text-muted">24h 流入</span>
          </div>
          <p className="text-xl font-black text-success">${Number(b.inflow_24h).toLocaleString()}</p>
        </div>
        <div className="glass p-4 rounded-2xl border-white/5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-danger" />
            <span className="text-xs text-muted">24h 流出</span>
          </div>
          <p className="text-xl font-black text-danger">${Number(b.outflow_24h).toLocaleString()}</p>
        </div>
        <div className="glass p-4 rounded-2xl border-white/5">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-accent" />
            <span className="text-xs text-muted">净流入</span>
          </div>
          <p className={`text-xl font-black ${netFlow >= 0 ? "text-success" : "text-danger"}`}>
            {netFlow >= 0 ? "+" : ""}${netFlow.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Alert & Anomaly */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass p-6 rounded-2xl border-white/5">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" /> 告警状态
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-black text-warning">{metrics.alerts.active_alerts}</p>
              <p className="text-[10px] text-muted">待处理</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-danger">{metrics.alerts.critical_alerts}</p>
              <p className="text-[10px] text-muted">紧急</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-white">{metrics.alerts.alerts_1h}</p>
              <p className="text-[10px] text-muted">近1小时</p>
            </div>
          </div>
        </div>
        <div className="glass p-6 rounded-2xl border-white/5">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-danger" /> 异常检测
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-2xl font-black text-danger">{metrics.anomalies.active_anomalies}</p>
              <p className="text-[10px] text-muted">待调查</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-white">{metrics.anomalies.anomalies_1h}</p>
              <p className="text-[10px] text-muted">近1小时</p>
            </div>
          </div>
        </div>
      </div>

      {/* System Metrics */}
      <div>
        <h2 className="text-sm font-bold text-muted mb-4 flex items-center gap-2">
          <Server className="w-4 h-4" /> 系统指标
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="glass p-4 rounded-2xl border-white/5 text-center">
            <Clock className="w-5 h-5 text-accent mx-auto mb-2" />
            <p className="text-lg font-black text-white">{metrics.system.uptime_hours}h</p>
            <p className="text-[10px] text-muted">运行时间</p>
          </div>
          <div className="glass p-4 rounded-2xl border-white/5 text-center">
            <Cpu className="w-5 h-5 text-accent mx-auto mb-2" />
            <p className="text-lg font-black text-white">{metrics.system.cpu_usage_pct}%</p>
            <p className="text-[10px] text-muted">CPU</p>
          </div>
          <div className="glass p-4 rounded-2xl border-white/5 text-center">
            <HardDrive className="w-5 h-5 text-accent mx-auto mb-2" />
            <p className="text-lg font-black text-white">{metrics.system.memory_usage_pct}%</p>
            <p className="text-[10px] text-muted">内存</p>
          </div>
          <div className="glass p-4 rounded-2xl border-white/5 text-center">
            <Database className="w-5 h-5 text-accent mx-auto mb-2" />
            <p className="text-lg font-black text-white">{metrics.system.db_connections}</p>
            <p className="text-[10px] text-muted">DB连接</p>
          </div>
          <div className="glass p-4 rounded-2xl border-white/5 text-center">
            <Zap className="w-5 h-5 text-accent mx-auto mb-2" />
            <p className="text-lg font-black text-white">{metrics.system.api_latency_ms}ms</p>
            <p className="text-[10px] text-muted">API延迟</p>
          </div>
        </div>
      </div>

      {/* Data Sources Health */}
      <div>
        <h2 className="text-sm font-bold text-muted mb-4 flex items-center gap-2">
          <Database className="w-4 h-4" /> 数据源健康
        </h2>
        <div className="grid md:grid-cols-3 gap-3">
          {metrics.sources.map((src) => (
            <div key={src.source_id} className="glass p-3 rounded-xl border-white/5 flex items-center gap-3">
              {src.health_status === "healthy" ? (
                <CheckCircle className="w-5 h-5 text-success" />
              ) : (
                <XCircle className="w-5 h-5 text-danger" />
              )}
              <div className="flex-1">
                <p className="text-sm font-bold text-white">{src.name}</p>
                <p className="text-[10px] text-muted">{src.source_id}</p>
              </div>
              {src.error_count > 0 && (
                <span className="px-2 py-0.5 text-[10px] bg-danger/10 text-danger rounded-full">
                  {src.error_count} 错误
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Last Update */}
      <div className="text-center text-[10px] text-muted">
        最后更新: {new Date(metrics.timestamp).toLocaleString()}
      </div>
    </div>
  );
}
