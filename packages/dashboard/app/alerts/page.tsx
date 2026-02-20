"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Clock,
  Database,
  Filter,
  RefreshCw,
  Eye,
  Check,
  Activity,
  Search,
  ChevronDown,
  ChevronUp,
  Trash2,
  CheckSquare,
  Square,
  ExternalLink,
} from "lucide-react";
import { apiFetch } from "../lib/api";
import { PageSkeleton } from "../components/Skeleton";
import { FeedbackBar } from "../components/FeedbackBar";
import { AlertTrendChart } from "../components/AlertTrendChart";

interface Alert {
  event_id: string;
  rule_id: string;
  rule_name: string;
  pool_id?: string;
  chain_id?: string;
  protocol_id?: string;
  metric_value: number;
  threshold_value: number;
  severity: string;
  status: string;
  message: string;
  triggered_at: string;
  acknowledged_at?: string;
  resolved_at?: string;
  acknowledged_by?: string;
}

interface Stats {
  triggered: number;
  acknowledged: number;
  resolved: number;
  critical: number;
}

export default function AlertsPage() {
  const t = useTranslations("alerts");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stats, setStats] = useState<Stats>({ triggered: 0, acknowledged: 0, resolved: 0, critical: 0 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);

  // Helper component for Stat Cards
  const StatCard = ({ label, value, icon, color, active, isCritical }: any) => (
    <div className={`group glass rounded-[2rem] p-8 border-white/5 transition-all duration-500 hover:scale-105 hover:shadow-2xl ${
      active ? (color === 'danger' ? 'border-danger/30 shadow-danger/10' : 'border-warning/30 shadow-warning/10') : ''
    } ${isCritical ? 'bg-danger/5' : ''}`}>
      <div className="flex justify-between items-start mb-4">
        <div className={`p-4 rounded-2xl ${
          color === 'danger' ? 'bg-danger/10 text-danger border-danger/20' :
          color === 'warning' ? 'bg-warning/10 text-warning border-warning/20' :
          'bg-success/10 text-success border-success/20'
        } group-hover:scale-110 transition-transform`}>
          {icon}
        </div>
        {active && <div className={`w-3 h-3 rounded-full animate-ping ${color === 'danger' ? 'bg-danger' : 'bg-warning'}`} />}
      </div>
      <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] mb-2">{label}</p>
      <p className={`text-4xl font-black tracking-tighter ${
        color === 'danger' ? 'text-danger' :
        color === 'warning' ? 'text-warning' :
        'text-success'
      }`}>{value}</p>
    </div>
  );

  const loadAlerts = async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (statusFilter !== "all") params.append("status", statusFilter);
    if (severityFilter) params.append("severity", severityFilter);
    if (searchQuery) params.append("search", searchQuery);
    params.append("limit", limit.toString());
    params.append("offset", offset.toString());

    const result = await apiFetch<{ alerts: Alert[]; stats: Stats; total: number }>(`/api/alerts?${params}`);
    if (result.ok) {
      setAlerts(result.data.alerts || []);
      setStats(result.data.stats || { triggered: 0, acknowledged: 0, resolved: 0, critical: 0 });
      setTotal(result.data.total || 0);
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAlerts();
    const interval = setInterval(loadAlerts, 30000);
    return () => clearInterval(interval);
  }, [statusFilter, severityFilter, searchQuery, offset]);

  const handleAction = async (eventId: string, action: string) => {
    const result = await apiFetch<{ success: boolean; message: string }>("/api/alerts", {
      method: "POST",
      body: JSON.stringify({ action, eventId }),
    });
    if (result.ok) {
      setSuccess(result.data.message);
      loadAlerts();
    } else {
      setError(result.error);
    }
  };

  const handleBatchAction = async (action: string) => {
    if (selectedIds.size === 0) {
      setError(t("selectFirst"));
      return;
    }

    const result = await apiFetch<{ success: boolean; message: string }>("/api/alerts", {
      method: "POST",
      body: JSON.stringify({ action, eventIds: Array.from(selectedIds) }),
    });

    if (result.ok) {
      setSuccess(result.data.message);
      setSelectedIds(new Set());
      loadAlerts();
    } else {
      setError(result.error);
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === alerts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(alerts.map((a) => a.event_id)));
    }
  };

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

  // Detail Item helper
  const DetailItem = ({ label, value, mono }: any) => (
    <div className="space-y-1">
      <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] opacity-60">{label}</p>
      <p className={`text-sm font-black text-white ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );

  if (loading && alerts.length === 0) {
    return <PageSkeleton />;
  }

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* 反馈提示 */}
      <FeedbackBar message={error} variant="error" onDismiss={() => setError(null)} />
      <FeedbackBar message={success} variant="success" onDismiss={() => setSuccess(null)} />

      {/* Header - Premium 增强 */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div className="flex items-center gap-6">
          <div className="relative p-6 rounded-[2rem] bg-gradient-to-br from-danger/20 to-danger/5 border border-danger/20 shadow-2xl shadow-danger/20 group">
            <Bell className="w-10 h-10 text-danger group-hover:animate-shake" />
            {stats.triggered > 0 && (
              <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-danger text-white text-[11px] font-black flex items-center justify-center animate-glow border-2 border-[#0a0a0f]">
                {stats.triggered}
              </div>
            )}
          </div>
          <div>
            <h1 className="text-5xl font-black text-white tracking-tighter font-outfit">{t("title")} <span className="text-gradient-danger">{t("titleAccent")}</span></h1>
            <p className="text-muted text-base font-medium mt-2 opacity-80">
              {t("subtitle")}
            </p>
          </div>
        </div>
        <button
          onClick={loadAlerts}
          className="group flex items-center gap-3 px-8 py-3.5 rounded-[1.2rem] bg-white/5 hover:bg-white/10 border border-white/10 hover:border-accent/40 text-[11px] font-black uppercase tracking-widest text-white transition-all hover:shadow-2xl hover:shadow-accent/10 active:scale-95"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} />
          {t("syncStatus")}
        </button>
      </div>

      {/* Stats - 增强质感 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <StatCard 
          label={t("pending")} 
          value={stats.triggered} 
          icon={<AlertCircle className="w-6 h-6" />} 
          color="danger" 
          active={stats.triggered > 0}
        />
        <StatCard 
          label={t("acknowledged")} 
          value={stats.acknowledged} 
          icon={<Eye className="w-6 h-6" />} 
          color="warning" 
        />
        <StatCard 
          label={t("resolved")} 
          value={stats.resolved} 
          icon={<CheckCircle className="w-6 h-6" />} 
          color="success" 
        />
        <StatCard 
          label={t("critical")} 
          value={stats.critical} 
          icon={<AlertTriangle className="w-6 h-6" />} 
          color="danger" 
          isCritical
          active={stats.critical > 0}
        />
      </div>

      {/* 趋势图表 - 增加容器质感 */}
      <div className="glass p-8 rounded-[2.5rem] border-white/5 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <Activity className="w-5 h-5 text-accent" />
          <h3 className="text-lg font-black text-white uppercase tracking-widest">{t("trendTitle")}</h3>
        </div>
        <AlertTrendChart hours={24} />
      </div>

      {/* 搜索和筛选 */}
      <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          {/* 搜索框 */}
          <div className="flex-1 relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted group-focus-within:text-accent transition-colors" />
            <input
              type="text"
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-muted focus:outline-none focus:border-accent/50 focus:bg-white/10 transition-all shadow-sm hover:shadow-md"
            />
          </div>

          {/* 高级筛选按钮 */}
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-medium transition-all ${
              showAdvancedFilters
                ? "bg-accent/10 border-accent/30 text-accent shadow-lg shadow-accent/10"
                : "bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-accent/20"
            }`}
          >
            <Filter className="w-4 h-4" />
            {t("advancedFilter")}
            {showAdvancedFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* 高级筛选面板 */}
        {showAdvancedFilters && (
          <div className="glass-cyber p-6 rounded-2xl space-y-4 animate-in slide-in-from-top-2 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 状态筛选 */}
              <div>
                <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 block">{t("filterStatus")}</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {["all", "triggered", "acknowledged", "resolved"].map((f) => (
                    <button
                      key={f}
                      onClick={() => setStatusFilter(f)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                        statusFilter === f
                          ? "bg-gradient-to-r from-accent to-accent-light text-white shadow-lg shadow-accent/20"
                          : "bg-white/5 text-muted hover:bg-white/10 hover:text-white border border-white/10"
                      }`}
                    >
                      {f === "all" ? t("all") : f === "triggered" ? t("triggered") : f === "acknowledged" ? t("ack") : t("resolvedLabel")}
                    </button>
                  ))}
                </div>
              </div>

              {/* 严重程度筛选 */}
              <div>
                <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 block">{t("filterSeverity")}</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {["", "critical", "warning", "info"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setSeverityFilter(s)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                        severityFilter === s
                          ? s === "critical"
                            ? "bg-gradient-to-r from-danger to-danger/80 text-white shadow-lg shadow-danger/20"
                            : s === "warning"
                            ? "bg-gradient-to-r from-warning to-warning/80 text-white shadow-lg shadow-warning/20"
                            : s === "info"
                            ? "bg-gradient-to-r from-blue-500 to-blue-400 text-white shadow-lg shadow-blue-500/20"
                            : "bg-gradient-to-r from-accent to-accent-light text-white shadow-lg shadow-accent/20"
                          : "bg-white/5 text-muted hover:bg-white/10 hover:text-white border border-white/10"
                      }`}
                    >
                      {s === "" ? t("all") : s === "critical" ? t("severityCritical") : s === "warning" ? t("severityWarning") : t("severityInfo")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* 批量操作栏 */}
      {selectedIds.size > 0 && (
        <div className="glass-cyber p-5 rounded-2xl border-accent/30 bg-gradient-to-r from-accent/10 to-accent/5 shadow-lg shadow-accent/10 animate-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-accent/20 border border-accent/30">
                <CheckSquare className="w-5 h-5 text-accent" />
              </div>
              <div>
                <span className="text-sm font-bold text-white">{t("selectedCount", { count: selectedIds.size })}</span>
                <p className="text-xs text-muted mt-0.5">{t("batchApply")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleBatchAction("batchAcknowledge")}
                className="group flex items-center gap-2 px-4 py-2 rounded-xl bg-warning/10 hover:bg-warning/20 border border-warning/20 hover:border-warning/30 text-warning text-sm font-medium transition-all hover:shadow-lg hover:shadow-warning/10"
              >
                <Eye className="w-4 h-4 group-hover:scale-110 transition-transform" />
                {t("batchAck")}
              </button>
              <button
                onClick={() => handleBatchAction("batchResolve")}
                className="group flex items-center gap-2 px-4 py-2 rounded-xl bg-success/10 hover:bg-success/20 border border-success/20 hover:border-success/30 text-success text-sm font-medium transition-all hover:shadow-lg hover:shadow-success/10"
              >
                <Check className="w-4 h-4 group-hover:scale-110 transition-transform" />
                {t("batchResolve")}
              </button>
              <button
                onClick={() => handleBatchAction("batchDelete")}
                className="group flex items-center gap-2 px-4 py-2 rounded-xl bg-danger/10 hover:bg-danger/20 border border-danger/20 hover:border-danger/30 text-danger text-sm font-medium transition-all hover:shadow-lg hover:shadow-danger/10"
              >
                <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                {t("batchDelete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert List */}
      <div className="space-y-3">
        {/* 全选 */}
        {alerts.length > 0 && (
          <div className="flex items-center gap-3 px-2">
            <button
              onClick={toggleSelectAll}
              className="group flex items-center gap-2 text-muted hover:text-white transition-all"
            >
              {selectedIds.size === alerts.length ? (
                <CheckSquare className="w-5 h-5 text-accent group-hover:scale-110 transition-transform" />
              ) : (
                <Square className="w-5 h-5 group-hover:scale-110 transition-transform" />
              )}
              <span className="text-sm font-medium">
                {selectedIds.size === alerts.length ? t("cancelSelectAll") : `${t("selectAll")} (${alerts.length})`}
              </span>
            </button>
          </div>
        )}

        {alerts.length === 0 ? (
          <div className="glass-cyber p-16 rounded-3xl text-center">
            <div className="inline-flex p-6 rounded-full bg-success/10 border border-success/20 mb-6">
              <CheckCircle className="w-16 h-16 text-success" />
            </div>
            <p className="text-xl font-bold text-white mb-2">{t("allGood")}</p>
            <p className="text-sm text-muted">{t("noAlerts")}</p>
          </div>
        ) : (
          alerts.map((alert) => {
            const isSelected = selectedIds.has(alert.event_id);
            const isExpanded = expandedIds.has(alert.event_id);
            return (
              <div
                key={alert.event_id}
                className={`group relative glass rounded-[2rem] transition-all duration-500 overflow-hidden border-white/5 hover:border-white/20 hover:shadow-2xl stagger-in ${
                  alert.severity === "critical" ? "bg-danger/[0.02]" : ""
                } ${isSelected ? "ring-2 ring-accent border-accent shadow-accent/10" : ""}`}
              >
                {/* 状态指示条 */}
                <div
                  className={`absolute left-0 top-0 bottom-0 w-1.5 transition-all duration-500 ${
                    alert.status === "resolved" ? "bg-success" :
                    alert.severity === "critical" ? "bg-danger shadow-[0_0_15px_#ef4444]" :
                    alert.severity === "warning" ? "bg-warning" : "bg-accent"
                  }`}
                />

                <div className="flex items-start gap-6 p-8 pl-10">
                  {/* 选择框 */}
                  <button
                    onClick={() => toggleSelect(alert.event_id)}
                    className="mt-2 text-muted hover:text-white transition-all group/checkbox"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-6 h-6 text-accent animate-scale-in" />
                    ) : (
                      <Square className="w-6 h-6 opacity-30 group-hover:opacity-100 transition-opacity" />
                    )}
                  </button>

                  {/* 内容 */}
                  <div className="flex-1 min-w-0 space-y-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${
                        alert.status === "triggered" ? "bg-danger/10 text-danger border-danger/20" :
                        alert.status === "acknowledged" ? "bg-warning/10 text-warning border-warning/20" :
                        "bg-success/10 text-success border-success/20"
                      }`}>
                        {alert.status === "triggered" ? t("statusTriggered") : alert.status === "acknowledged" ? t("statusAck") : t("statusResolved")}
                      </div>

                      <div className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${
                        alert.severity === "critical" ? "bg-danger text-white border-danger" :
                        alert.severity === "warning" ? "bg-warning/10 text-warning border-warning/20" :
                        "bg-accent/10 text-accent border-accent/20"
                      }`}>
                        {alert.severity === "critical" ? t("severityRisk") : alert.severity === "warning" ? t("severityWarn") : t("severityInfoLabel")}
                      </div>

                      <span className="text-[10px] font-black text-muted/60 uppercase tracking-[0.2em] px-4 py-1.5 rounded-xl border border-white/5 bg-white/5">
                        {alert.rule_name}
                      </span>
                    </div>

                    <h4 className="text-xl font-black text-white leading-tight group-hover:text-accent transition-colors">
                      {alert.message}
                    </h4>

                    {/* 元信息 */}
                    <div className="flex items-center gap-6 text-[11px] font-black text-muted/60 uppercase tracking-widest">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        {new Date(alert.triggered_at).toLocaleString("zh-CN")}
                      </div>
                      {alert.chain_id && (
                        <div className="flex items-center gap-2">
                          <Activity className="w-4 h-4" />
                          {t("chain")}: {alert.chain_id}
                        </div>
                      )}
                      {alert.protocol_id && (
                        <div className="flex items-center gap-2">
                          <Database className="w-4 h-4" />
                          {t("protocol")}: {alert.protocol_id}
                        </div>
                      )}
                    </div>

                    {/* 详情扩展 */}
                    {isExpanded && (
                      <div className="pt-6 mt-6 border-t border-white/5 grid grid-cols-2 md:grid-cols-4 gap-6 animate-in slide-in-from-top-4 duration-500">
                        <DetailItem label={t("currentMetric")} value={alert.metric_value} />
                        <DetailItem label={t("threshold")} value={alert.threshold_value} />
                        <DetailItem label={t("pool")} value={alert.pool_id || t("global")} mono />
                        {alert.acknowledged_at && <DetailItem label={t("ackTime")} value={new Date(alert.acknowledged_at).toLocaleTimeString()} />}
                      </div>
                    )}
                  </div>

                  {/* 操作区 */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleExpand(alert.event_id)}
                      className="p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-muted hover:text-white transition-all"
                    >
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                    {alert.status !== "resolved" && (
                      <div className="flex items-center gap-2 bg-black/20 p-1 rounded-2xl border border-white/5">
                        {alert.status === "triggered" && (
                          <button
                            onClick={() => handleAction(alert.event_id, "acknowledge")}
                            className="p-3 rounded-xl hover:bg-warning/20 text-warning/60 hover:text-warning transition-all"
                            title={t("confirmAlert")}
                          >
                            <Eye className="w-5 h-5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleAction(alert.event_id, "resolve")}
                          className="p-3 rounded-xl hover:bg-success/20 text-success/60 hover:text-success transition-all"
                          title={t("markResolved")}
                        >
                          <Check className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="glass-cyber p-5 rounded-2xl">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted">
              {t("totalCount", { total, current: currentPage, totalPages })}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="group flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-accent/30 text-white text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/5 disabled:hover:border-white/10 hover:shadow-lg hover:shadow-accent/5"
              >
                <ChevronDown className="w-4 h-4 rotate-90 group-hover:-translate-x-0.5 transition-transform" />
                {t("prevPage")}
              </button>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
                className="group flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-accent/30 text-white text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/5 disabled:hover:border-white/10 hover:shadow-lg hover:shadow-accent/5"
              >
                {t("nextPage")}
                <ChevronDown className="w-4 h-4 -rotate-90 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
