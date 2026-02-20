"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  ScrollText,
  Search,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Cpu,
  Radio,
  ChevronDown,
  ChevronRight,
  Download,
  Trash2,
  Filter,
} from "lucide-react";
import { apiFetch } from "../lib/api";
import { PageSkeleton } from "../components/Skeleton";
import { FeedbackBar } from "../components/FeedbackBar";

interface LogEntry {
  id: number;
  eventType: string;
  severity: string;
  source: string;
  message: string;
  metadata: any;
  createdAt: string;
}

interface LogStats {
  total: number;
  info: number;
  warning: number;
  error: number;
  critical: number;
  lastHour: number;
  last24h: number;
}

interface HealthStatus {
  scannerAlive: boolean;
  scanAgeSec: number;
  poolCount: number;
  activePositions: number;
  autopilotEnabled: boolean;
  dryRun: boolean;
  killSwitch: boolean;
}

const SEVERITY_KEYS = ["info", "warning", "error", "critical"] as const;
const SOURCE_KEYS = ["scanner", "dashboard", "risk_monitor", "executor", "telegram_bot", "ai", "strategy_worker"] as const;
const SEVERITY_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
  info: { icon: CheckCircle2, color: "text-accent", bg: "bg-accent/10" },
  warning: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10" },
  error: { icon: XCircle, color: "text-danger", bg: "bg-danger/10" },
  critical: { icon: AlertCircle, color: "text-danger", bg: "bg-danger/20" },
};

// 将英文日志消息翻译为中文（常见模式匹配）
function translateMessage(msg: string): string {
  // 已经是中文的直接返回
  if (/[\u4e00-\u9fa5]/.test(msg)) return msg;

  // 常见英文消息翻译
  if (msg.startsWith("Scanned")) {
    const match = msg.match(/Scanned (\d+) pools, upserted (\d+)/);
    if (match) return `已扫描 ${match[1]} 个池子，成功写入 ${match[2]} 个`;
  }
  if (msg === "Native token prices updated") return "原生代币价格已更新";
  if (msg.startsWith("Pool no longer")) return "池子不再属于最优组合，建议退出";
  if (msg.startsWith("Simulation failed")) return `交易模拟失败: ${msg.replace("Simulation failed: ", "")}`;
  if (msg.startsWith("KILL SWITCH")) return "紧急停止已激活 — 所有交易已阻断";
  if (msg.startsWith("Transaction amount")) return msg.replace("Transaction amount", "交易金额").replace("exceeds limit", "超出限额");
  if (msg.startsWith("Daily limit")) return "每日交易限额即将超出";

  return msg;
}

export default function LogsPage() {
  const t = useTranslations("logs");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [sources, setSources] = useState<{ source: string; count: number }[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(5);

  // 筛选
  const [severity, setSeverity] = useState("all");
  const [source, setSource] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const fetchLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: "200" });
    if (severity !== "all") params.set("severity", severity);
    if (source !== "all") params.set("source", source);
    if (search) params.set("search", search);

    const result = await apiFetch<{ logs: LogEntry[]; stats: LogStats; sources: { source: string; count: number }[]; health: HealthStatus }>(`/api/logs?${params}`);
    if (result.ok) {
      setLogs(result.data.logs || []);
      setStats(result.data.stats || null);
      setSources(result.data.sources || []);
      setHealth(result.data.health || null);
    } else {
      if (!silent) setError(result.error);
    }
    setLoading(false);
  }, [severity, source, search]);

  const handleExport = () => {
    setExporting(true);
    try {
      const dataStr = JSON.stringify(logs, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      const exportFileDefaultName = `logs-${new Date().toISOString()}.json`;
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
    } catch (e) {
      setError(t("exportFail"));
    }
    setTimeout(() => setExporting(false), 1000);
  };

  const handleCleanup = async () => {
    if (!confirm(t("cleanConfirm"))) return;
    setCleaning(true);
    const result = await apiFetch("/api/logs/cleanup", { method: "POST" });
    if (result.ok) {
      fetchLogs();
    } else {
      setError(result.error || t("cleanFail"));
    }
    setCleaning(false);
  };

  // 初始加载 + 筛选变化
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // 自动刷新（每 5 秒）
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => fetchLogs(true), 5000);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchLogs]);

  // 倒计时
  useEffect(() => {
    if (!autoRefresh) return;
    setCountdown(5);
    const timer = setInterval(() => setCountdown(c => c <= 1 ? 5 : c - 1), 1000);
    return () => clearInterval(timer);
  }, [autoRefresh, logs]);

  return (
    <div className="relative min-h-screen">
      <div className="bg-grid" />
      
      <div className="space-y-8 pb-20 animate-in fade-in duration-700 stagger-in relative z-10">
        {/* 页面标题 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="text-4xl font-black text-white tracking-tight font-outfit">
              {t("title")}<span className="text-gradient-accent">{t("titleAccent")}</span>
            </h2>
            <p className="text-muted text-sm mt-1 flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-accent" />
              {t("subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleExport}
              disabled={exporting || logs.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 glass rounded-2xl hover:bg-white/5 transition-all text-xs font-bold text-muted hover:text-white disabled:opacity-50"
              title={t("exportTitle")}
            >
              <Download className={`w-4 h-4 ${exporting ? "animate-bounce" : ""}`} />
              {exporting ? t("exporting") : t("exportJson")}
            </button>
            <button
              onClick={handleCleanup}
              disabled={cleaning}
              className="flex items-center gap-2 px-4 py-2.5 glass rounded-2xl border-danger/10 hover:border-danger/30 hover:bg-danger/5 transition-all text-xs font-bold text-muted hover:text-danger disabled:opacity-50"
              title={t("cleanTitle")}
            >
              <Trash2 className={`w-4 h-4 ${cleaning ? "animate-pulse" : ""}`} />
              {cleaning ? t("cleaning") : t("logClean")}
            </button>
            <div className="h-8 w-[1px] bg-white/10 mx-1 hidden md:block" />
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-2 px-4 py-2.5 glass rounded-2xl text-xs font-bold uppercase transition-all ${
                autoRefresh ? "text-success border-success/30 bg-success/5 shadow-[0_0_15px_rgba(16,185,129,0.1)]" : "text-muted"
              }`}
            >
              <Radio className={`w-3 h-3 ${autoRefresh ? "animate-pulse" : ""}`} />
              {autoRefresh ? `${t("realtime")} (${countdown}s)` : t("paused")}
            </button>
            <button
              onClick={() => fetchLogs()}
              className="flex items-center gap-2 px-4 py-2.5 glass rounded-2xl hover:bg-white/5 transition-all active:scale-95 group"
            >
              <RefreshCw className={`w-4 h-4 text-muted group-hover:text-accent ${loading ? "animate-spin" : ""}`} />
              <span className="text-xs font-bold text-muted group-hover:text-white uppercase">{t("refresh")}</span>
            </button>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <FeedbackBar message={error} variant="error" onDismiss={() => setError(null)} autoDismissMs={5000} />
        )}

        {/* 系统健康状态 */}
        {health && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <HealthBadge
              label={t("scanner")}
              status={health.scannerAlive}
              detail={health.scannerAlive ? `${health.scanAgeSec}s ${t("ago")}` : t("offline")}
            />
            <HealthBadge
              label={t("autopilot")}
              status={health.autopilotEnabled}
              detail={health.autopilotEnabled ? (health.dryRun ? t("dryRun") : t("live")) : t("off")}
              warning={health.dryRun}
            />
            <HealthBadge
              label={t("killSwitch")}
              status={!health.killSwitch}
              detail={health.killSwitch ? t("triggered") : t("normal")}
              danger={health.killSwitch}
            />
            <HealthBadge label={t("trackingPools")} status={health.poolCount > 0} detail={`${health.poolCount}`} />
            <HealthBadge label={t("activePositions")} status={true} detail={`${health.activePositions}`} />
            <HealthBadge label={t("logs24h")} status={true} detail={`${stats?.last24h || 0}`} />
            <HealthBadge
              label={t("anomalyCount")}
              status={(stats?.error || 0) + (stats?.critical || 0) === 0}
              detail={`${(stats?.error || 0) + (stats?.critical || 0)}`}
              danger={(stats?.error || 0) + (stats?.critical || 0) > 0}
            />
          </div>
        )}

        {/* 统计与筛选 */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* 统计卡片 */}
          <div className="xl:col-span-5 grid grid-cols-2 sm:grid-cols-5 gap-3">
            {stats && (
              <>
                <StatBadge label={t("all")} count={stats.total} color="text-white" active={severity === "all"} onClick={() => setSeverity("all")} />
                <StatBadge label={t("info")} count={stats.info} color="text-accent" active={severity === "info"} onClick={() => setSeverity("info")} />
                <StatBadge label={t("warning")} count={stats.warning} color="text-warning" active={severity === "warning"} onClick={() => setSeverity("warning")} />
                <StatBadge label={t("error")} count={stats.error} color="text-danger" active={severity === "error"} onClick={() => setSeverity("error")} />
                <StatBadge label={t("critical")} count={stats.critical} color="text-danger" active={severity === "critical"} onClick={() => setSeverity("critical")} />
              </>
            )}
          </div>

          {/* 筛选栏 */}
          <div className="xl:col-span-7 flex flex-col sm:flex-row items-center gap-4">
            <div className="flex-1 w-full relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted group-focus-within:text-accent transition-colors" />
              <input
                type="text"
                placeholder={t("searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-3.5 text-sm text-white focus:outline-none focus:border-accent/50 focus:bg-white/10 transition-all font-medium"
              />
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none">
                <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full sm:w-48 bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-3.5 text-sm text-white outline-none cursor-pointer hover:bg-white/10 transition-all appearance-none"
                >
                  <option value="all" className="bg-[#030406]">{t("allSources")}</option>
                  {SOURCE_KEYS.map((key) => (
                    <option key={key} value={key} className="bg-[#030406]">{t(key)}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {/* 日志列表 */}
        <div className="glass rounded-[2rem] overflow-hidden border border-white/5 shadow-2xl relative">
          {loading && logs.length === 0 ? (
            <div className="p-32 text-center">
              <RefreshCw className="w-12 h-12 text-accent/20 mx-auto mb-6 animate-spin" />
              <div className="text-muted font-black uppercase tracking-[0.3em] text-[10px] animate-pulse">
                INITIALIZING TERMINAL...
              </div>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-32 text-center">
              <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-6 border border-white/5">
                <ScrollText className="w-8 h-8 text-muted/20" />
              </div>
              <p className="text-muted font-black uppercase tracking-[0.2em] text-[10px]">{t("noLogs")}</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {logs.map((log) => {
                const sev = SEVERITY_CONFIG[log.severity] || SEVERITY_CONFIG.info;
                const SevIcon = sev.icon;
                const isExpanded = expandedId === log.id;
                const hasMetadata = log.metadata && log.metadata !== "{}" && Object.keys(log.metadata).length > 0;

                return (
                  <div
                    key={log.id}
                    className={`group px-6 py-5 hover:bg-white/[0.03] transition-all cursor-pointer relative ${isExpanded ? "bg-white/[0.03]" : ""}`}
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  >
                    {isExpanded && <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent shadow-[0_0_15px_rgba(14,165,233,0.5)]" />}
                    
                    <div className="flex items-start gap-5">
                      {/* 严重性图标 */}
                      <div className={`mt-1 p-2.5 rounded-xl border ${sev.bg} ${sev.color.replace('text-', 'border-')}/10`}>
                        <SevIcon className={`w-4 h-4 ${sev.color}`} />
                      </div>

                      {/* 主内容 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2">
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border shadow-sm ${sev.bg} ${sev.color.replace('text-', 'border-')}/20 ${sev.color}`}>
                            {(SEVERITY_KEYS as readonly string[]).includes(log.severity) ? t(log.severity as (typeof SEVERITY_KEYS)[number]) : log.severity}
                          </span>
                          <span className="flex items-center gap-1.5 text-[10px] font-bold text-accent font-outfit uppercase tracking-wider">
                            <Cpu className="w-3 h-3" />
                            {(SOURCE_KEYS as readonly string[]).includes(log.source) ? t(log.source as (typeof SOURCE_KEYS)[number]) : log.source}
                          </span>
                          <span className="text-[10px] font-black text-muted-strong uppercase tracking-tight">
                            {t(log.eventType as any) !== log.eventType ? t(log.eventType as any) : log.eventType}
                          </span>
                        </div>
                        <p className={`text-sm text-white font-medium leading-relaxed transition-all ${isExpanded ? "" : "line-clamp-2"}`}>
                          {translateMessage(log.message)}
                        </p>

                        {/* 展开的 metadata */}
                        {isExpanded && hasMetadata && (
                          <div className="mt-5 p-5 rounded-2xl bg-[#030406]/60 border border-white/5 shadow-inner">
                            <div className="flex items-center justify-between mb-4">
                              <p className="text-[10px] font-black text-muted-strong uppercase tracking-[0.2em]">Payload Analysis</p>
                              <div className="px-2 py-0.5 rounded-md bg-white/5 text-[9px] font-mono text-muted">JSON_FORMAT</div>
                            </div>
                            <pre className="text-[11px] text-accent/80 font-mono whitespace-pre-wrap break-all leading-relaxed scrollbar-hide">
                              {typeof log.metadata === "string" ? log.metadata : JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>

                      {/* 时间 + 展开指示 */}
                      <div className="flex flex-col items-end gap-3 shrink-0 pt-1">
                        <div className="text-right">
                          <p className="text-[11px] font-black text-white font-outfit">
                            {new Date(log.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                          </p>
                          <p className="text-[9px] font-bold text-muted-strong mt-0.5">
                            {new Date(log.createdAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
                          </p>
                        </div>
                        {hasMetadata && (
                          <div className={`p-1.5 rounded-lg border border-white/5 group-hover:border-white/10 transition-colors ${isExpanded ? "bg-accent/10 border-accent/20" : ""}`}>
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-accent" /> : <ChevronRight className="w-4 h-4 text-muted-strong" />}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 来源分布统计 */}
        <section className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.4em] whitespace-nowrap">
              Log Source Distribution (24H)
            </h3>
            <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          </div>
          
          <div className="flex flex-wrap justify-center gap-3">
            {sources.map((s) => (
              <button
                key={s.source}
                onClick={() => setSource(s.source === source ? "all" : s.source)}
                className={`flex items-center gap-3 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all glass-hover border ${
                  s.source === source 
                    ? "bg-accent/10 text-accent border-accent/40 shadow-[0_0_15px_rgba(14,165,233,0.1)]" 
                    : "bg-white/5 text-muted-strong border-white/5 hover:text-white hover:border-white/10"
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${s.source === source ? "bg-accent animate-pulse" : "bg-muted-strong opacity-40"}`} />
                {(SOURCE_KEYS as readonly string[]).includes(s.source) ? t(s.source as (typeof SOURCE_KEYS)[number]) : s.source}
                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black font-outfit ${s.source === source ? "bg-accent/20 text-accent" : "bg-white/10 text-muted-strong"}`}>
                  {s.count}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function HealthBadge({ label, status, detail, warning, danger }: { label: string; status: boolean; detail: string; warning?: boolean; danger?: boolean }) {
  const color = danger ? "border-danger/30 bg-danger/5" : warning ? "border-warning/30 bg-warning/5" : status ? "border-success/30 bg-success/5" : "border-muted/30 bg-muted/5";
  const dotColor = danger ? "bg-danger" : warning ? "bg-warning" : status ? "bg-success" : "bg-muted";
  const textColor = danger ? "text-danger" : warning ? "text-warning" : status ? "text-success" : "text-muted";

  return (
    <div className={`glass p-3 rounded-2xl border ${color} flex items-center gap-3`}>
      <div className={`w-2 h-2 rounded-full ${dotColor} ${status && !danger ? "animate-pulse" : ""}`} />
      <div>
        <p className="text-[9px] font-black text-muted uppercase tracking-widest">{label}</p>
        <p className={`text-sm font-black ${textColor}`}>{detail}</p>
      </div>
    </div>
  );
}

function StatBadge({ label, count, color, active, onClick }: { label: string; count: number; color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`glass p-4 rounded-2xl border transition-all text-left ${
        active ? "border-accent/30 bg-accent/5 shadow-[0_0_15px_rgba(99,102,241,0.1)]" : "border-white/5 hover:border-white/10"
      }`}
    >
      <p className="text-[9px] font-black text-muted uppercase tracking-widest">{label}</p>
      <p className={`text-2xl font-black ${active ? "text-accent" : color}`}>{count.toLocaleString()}</p>
    </button>
  );
}
