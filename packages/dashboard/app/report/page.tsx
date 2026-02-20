"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  FileText,
  Download,
  Printer,
  Calendar,
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  PieChart,
  Clock,
  AlertTriangle,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { apiFetch, safeNum } from "../lib/api";
import { PageSkeleton } from "../components/Skeleton";
import { FeedbackBar } from "../components/FeedbackBar";

interface ReportData {
  reportPeriod?: {
    startDate: string;
    endDate: string;
    generatedAt: string;
  };
  overview?: { total_pools?: number; total_tvl?: number; avg_apr?: number };
  positions?: {
    total_positions?: number;
    total_value?: number;
    realized_pnl?: number;
    unrealized_pnl?: number;
  };
  transactionsByType?: { tx_type: string; type_count: number; total_volume: number }[];
  alerts?: { total_alerts?: number; critical?: number; warning?: number; resolved?: number };
  dailyPerformance?: { date: string; positions_opened: number; value: number }[];
  recentTransactions?: { tx_hash: string; chain_id: string; tx_type: string; amount_usd: number; created_at: string }[];
  topPositions?: {
    position_id: string;
    chain_id: string;
    value_usd: number;
    unrealized_pnl_usd: number;
    symbol: string;
    protocol_id: string;
  }[];
}

const TX_TYPE_LABELS: Record<string, string> = {
  enter: "进入",
  exit: "退出",
  deposit: "存款",
  withdraw: "提款",
  swap: "兑换",
  wrap: "包装",
  unwrap: "解包",
  approve: "授权",
  supply: "供应",
  borrow: "借款",
  repay: "还款",
};

export default function ReportPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [syncing, setSyncing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const reportRef = useRef<HTMLDivElement>(null);

  const syncPositions = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await apiFetch<{ success: boolean; updated: number }>("/api/positions/sync", {
        method: "POST",
      });
      if (!result.ok) {
        console.error("同步持倉失敗:", result.error);
      }
    } catch (err) {
      console.error("同步持倉錯誤:", err);
    } finally {
      setSyncing(false);
    }
  }, []);

  const fetchReport = useCallback(async (start: string, end: string, skipSync = false) => {
    if (!start || !end) return;
    setLoading(true);
    setError(null);

    // 先同步持倉價格（除非明確跳過）
    if (!skipSync) {
      await syncPositions();
    }

    const result = await apiFetch<ReportData>(`/api/report?startDate=${start}&endDate=${end}`);
    if (result.ok) {
      setData(result.data);
    } else {
      setError(result.error ?? "加載失敗");
      setData(null);
    }
    setLoading(false);
  }, [syncPositions]);

  useEffect(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startStr = start.toISOString().split("T")[0];
    const endStr = end.toISOString().split("T")[0];
    setDateRange({ start: startStr, end: endStr });
    fetchReport(startStr, endStr);
  }, [fetchReport]);

  // 自動刷新邏輯
  useEffect(() => {
    if (!autoRefresh || !dateRange.start || !dateRange.end) return;

    const interval = setInterval(() => {
      console.log("自動刷新報告資料...");
      fetchReport(dateRange.start, dateRange.end, true); // 跳過同步，只刷新報告
    }, 30000); // 30 秒

    return () => clearInterval(interval);
  }, [autoRefresh, dateRange, fetchReport]);

  const handleRangeChange = (key: "start" | "end", value: string) => {
    const next = { ...dateRange, [key]: value };
    setDateRange(next);
    if (next.start && next.end) fetchReport(next.start, next.end);
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  const handleExportJSON = () => {
    if (!data || typeof window === "undefined" || typeof document === "undefined") return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `defi-report-${dateRange.start}-${dateRange.end}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !data) {
    return <PageSkeleton type="default" />;
  }

  // API 失败或无数据：完整占位页
  if (!data) {
    return (
      <div className="space-y-10 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-accent/20 flex items-center justify-center border border-accent/20">
                <FileText className="w-6 h-6 text-accent" />
              </div>
              <h2 className="text-5xl font-black text-white tracking-tighter">报告 <span className="text-gradient-accent">导出</span></h2>
            </div>
            <p className="text-muted text-base font-medium opacity-80">生成并导出多维度的资产投资与操作报告</p>
          </div>
        </div>
        
        {error && (
          <FeedbackBar message={error} variant="error" onDismiss={() => setError(null)} autoDismissMs={0} />
        )}

        <div className="glass rounded-[2.5rem] p-24 text-center border-white/5 shadow-2xl">
          <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-8 border border-white/5">
            <FileText className="w-10 h-10 text-muted/20" />
          </div>
          <h3 className="text-white font-black text-xl uppercase tracking-[0.2em] mb-4">报告加载失败</h3>
          <p className="text-muted/60 text-xs max-w-md mx-auto mb-10 uppercase tracking-widest font-bold">
            无法从神经链路获取报告数据。请检查 API 状态或网络连接。
          </p>
          <button
            onClick={() => dateRange.start && dateRange.end && fetchReport(dateRange.start, dateRange.end)}
            className="group flex items-center gap-3 px-8 py-4 glass rounded-2xl bg-accent/10 hover:bg-accent text-white transition-all active:scale-95 border border-accent/20"
          >
            <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
            <span className="text-[11px] font-black uppercase tracking-widest">重新同步</span>
          </button>
        </div>
      </div>
    );
  }

  const period = data.reportPeriod ?? {
    startDate: dateRange.start,
    endDate: dateRange.end,
    generatedAt: new Date().toISOString(),
  };
  const totalPnl = Number(
    (Number(data.positions?.realized_pnl) || 0) + (Number(data.positions?.unrealized_pnl) || 0)
  ) || 0;
  const topPositions = data.topPositions ?? [];
  const recentTransactions = data.recentTransactions ?? [];

  return (
    <div className="space-y-10 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* 头部 - 打印时隐藏 */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8 print:hidden">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-accent/20 flex items-center justify-center border border-accent/20">
              <FileText className="w-6 h-6 text-accent" />
            </div>
            <h2 className="text-5xl font-black text-white tracking-tighter">报告 <span className="text-gradient-accent">导出</span></h2>
          </div>
          <p className="text-muted text-base font-medium opacity-80">生成并导出多维度的资产投资与操作报告</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 px-6 py-3 glass rounded-2xl border-white/5">
            <Calendar className="w-4 h-4 text-muted" />
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => handleRangeChange("start", e.target.value)}
              className="bg-transparent border-none text-white text-[11px] font-black uppercase tracking-widest focus:outline-none cursor-pointer"
            />
            <span className="text-muted/40 font-black px-1">—</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => handleRangeChange("end", e.target.value)}
              className="bg-transparent border-none text-white text-[11px] font-black uppercase tracking-widest focus:outline-none cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded-2xl border border-white/5">
            <button
              onClick={() => fetchReport(dateRange.start, dateRange.end)}
              disabled={syncing || loading}
              className="p-3 rounded-xl bg-white/5 hover:bg-accent/10 text-accent border border-white/5 hover:border-accent/30 transition-all disabled:opacity-50 group"
              title="同步持倉價格並刷新報告"
            >
              <RefreshCw className={`w-4 h-4 ${syncing || loading ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} />
            </button>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                autoRefresh ? "bg-accent/10 text-accent border border-accent/20" : "text-muted hover:text-white"
              }`}
            >
              {autoRefresh ? "实时更新" : "手动刷新"}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-3 px-6 py-3.5 glass rounded-2xl border-white/5 hover:border-white/20 text-muted hover:text-white transition-all active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span className="text-[11px] font-black uppercase tracking-widest">打印报告</span>
            </button>
            <button
              onClick={handleExportJSON}
              className="flex items-center gap-3 px-8 py-3.5 bg-accent hover:bg-accent/90 text-white rounded-2xl shadow-lg shadow-accent/20 transition-all active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span className="text-[11px] font-black uppercase tracking-widest">导出 JSON</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <FeedbackBar message={error} variant="error" onDismiss={() => setError(null)} autoDismissMs={5000} />
      )}

      {/* 报告内容 */}
      <div ref={reportRef} className="space-y-10">
        <div className="glass p-10 rounded-[2.5rem] bg-gradient-to-br from-accent/10 via-accent/5 to-transparent border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-10 opacity-[0.03] pointer-events-none group-hover:scale-110 transition-transform duration-1000">
            <FileText className="w-64 h-64 text-accent rotate-12" />
          </div>
          
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start gap-8">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/20 text-accent text-[9px] font-black uppercase tracking-[0.2em] mb-4 border border-accent/20">
                ProfitLayer Intelligence Report
              </div>
              <h3 className="text-3xl font-black text-white tracking-tight">智能投资决策报告</h3>
              <p className="text-muted text-sm mt-3 font-medium opacity-80">
                周期覆盖: <span className="text-white">{new Date(period.startDate).toLocaleDateString("zh-CN")}</span> 至 <span className="text-white">{new Date(period.endDate).toLocaleDateString("zh-CN")}</span>
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-muted-strong font-black uppercase tracking-[0.2em] block mb-2 opacity-50">Generated ID: NY-REP-{new Date(period.generatedAt).getTime().toString().slice(-6)}</span>
              <div className="flex items-center gap-2 justify-end text-muted text-xs font-bold">
                <Clock className="w-3.5 h-3.5" />
                {new Date(period.generatedAt).toLocaleString("zh-CN")}
              </div>
            </div>
          </div>
        </div>

        {/* 核心指标 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard
            icon={<DollarSign className="w-5 h-5 text-accent" />}
            label="持仓总市值"
            value={`$${(Number(data.positions?.total_value) || 0).toLocaleString()}`}
            desc="当前 Matrix 资产总和"
          />
          <MetricCard
            icon={totalPnl >= 0 ? <TrendingUp className="w-5 h-5 text-success" /> : <TrendingDown className="w-5 h-5 text-danger" />}
            label="累计总盈亏"
            value={`${totalPnl >= 0 ? "+" : ""}$${safeNum(totalPnl)}`}
            color={totalPnl >= 0 ? "success" : "danger"}
            desc="已实现与未实现总和"
          />
          <MetricCard
            icon={<BarChart3 className="w-5 h-5 text-accent" />}
            label="活跃策略数"
            value={Number(data.overview?.total_pools) || 0}
            desc="多链活跃投资节点"
          />
          <MetricCard
            icon={<AlertTriangle className="w-5 h-5 text-warning" />}
            label="系统告警"
            value={Number(data.alerts?.total_alerts) || 0}
            sub={`${Number(data.alerts?.critical) || 0} 个严重风险`}
            desc="网络与健康度监测"
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
          {/* 活跃持仓 */}
          <div className="xl:col-span-8 glass rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl relative group/table">
            <div className="p-8 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-lg font-black text-white uppercase tracking-[0.2em] flex items-center gap-3">
                <PieChart className="w-5 h-5 text-accent" /> 资产配置分布
              </h3>
              <span className="text-[10px] font-black text-muted-strong uppercase tracking-widest">{topPositions.length} 个活跃节点</span>
            </div>
            
            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-white/30 text-[10px] font-black uppercase tracking-[0.2em] bg-white/[0.01] border-b border-white/5">
                    <th className="text-left px-10 py-6">资产池</th>
                    <th className="text-left px-10 py-6">所属网络</th>
                    <th className="text-right px-10 py-6">持仓价值</th>
                    <th className="text-right px-10 py-6">浮动盈亏</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {topPositions.length > 0 ? topPositions.map((p) => (
                    <tr key={p.position_id} className="hover:bg-white/[0.03] transition-all group/tr cursor-pointer">
                      <td className="px-10 py-7">
                        <div className="text-white font-black text-base tracking-tight group-hover/tr:text-accent transition-colors font-outfit uppercase">{p.symbol || p.protocol_id || "-"}</div>
                        <div className="text-[9px] text-muted-strong font-black uppercase tracking-widest mt-1 opacity-40">{p.protocol_id}</div>
                      </td>
                      <td className="px-10 py-7">
                        <span className="px-3 py-1 rounded-lg bg-white/5 text-[10px] font-black text-muted-strong uppercase tracking-widest border border-white/5">{p.chain_id}</span>
                      </td>
                      <td className="px-10 py-7 text-right">
                        <div className="text-white font-black text-base font-outfit tracking-tighter">${(Number(p.value_usd) || 0).toLocaleString()}</div>
                      </td>
                      <td className="px-10 py-7 text-right">
                        <div className={`font-black text-base tracking-tighter font-outfit ${(Number(p.unrealized_pnl_usd) || 0) >= 0 ? "text-success" : "text-danger"}`}>
                          {(Number(p.unrealized_pnl_usd) || 0) >= 0 ? "+" : ""}${safeNum(p.unrealized_pnl_usd)}
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={4} className="px-10 py-20 text-center opacity-40">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em]">暂无活跃持仓记录</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 告警摘要与操作建议 */}
          <div className="xl:col-span-4 space-y-10">
            <div className="glass rounded-[2.5rem] p-10 border border-white/5 shadow-2xl relative overflow-hidden bg-black/20">
              <h3 className="text-lg font-black text-white uppercase tracking-[0.2em] flex items-center gap-3 mb-10">
                <AlertTriangle className="w-5 h-5 text-warning" /> 异常监测摘要
              </h3>
              
              <div className="grid grid-cols-2 gap-8 relative z-10">
                <div className="space-y-2 group/alert">
                  <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] opacity-60 group-hover/alert:text-white transition-colors">总触发次数</p>
                  <p className="text-4xl font-black text-white tracking-tighter font-outfit">{Number(data.alerts?.total_alerts) || 0}</p>
                </div>
                <div className="space-y-2 group/alert">
                  <p className="text-[10px] font-black text-danger uppercase tracking-[0.2em] opacity-60">严重级别</p>
                  <p className="text-4xl font-black text-danger tracking-tighter font-outfit">{Number(data.alerts?.critical) || 0}</p>
                </div>
                <div className="space-y-2 group/alert">
                  <p className="text-[10px] font-black text-warning uppercase tracking-[0.2em] opacity-60">预警级别</p>
                  <p className="text-4xl font-black text-warning tracking-tighter font-outfit">{Number(data.alerts?.warning) || 0}</p>
                </div>
                <div className="space-y-2 group/alert">
                  <p className="text-[10px] font-black text-success uppercase tracking-[0.2em] opacity-60">已解决</p>
                  <p className="text-4xl font-black text-success tracking-tighter font-outfit">{Number(data.alerts?.resolved) || 0}</p>
                </div>
              </div>

              <div className="mt-12 pt-10 border-t border-white/5">
                <p className="text-[10px] font-black text-muted uppercase tracking-[0.3em] mb-4 opacity-40">AI 审计结论</p>
                <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5">
                  <p className="text-[11px] text-muted-strong font-bold leading-relaxed uppercase tracking-wider">
                    {Number(data.alerts?.critical) > 0 
                      ? "系统检测到关键风险暴露，建议立即执行 Panic Exit 或调整头寸权重。" 
                      : "各节点运行指标平稳，暂无重大安全隐患，建议维持当前策略配置。"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 近期操作记录 */}
        <div className="glass rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl">
          <div className="p-8 border-b border-white/5">
            <h3 className="text-lg font-black text-white uppercase tracking-[0.2em] flex items-center gap-3">
              <Clock className="w-5 h-5 text-accent" /> 近期操作审计流水
            </h3>
          </div>
          
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/30 text-[10px] font-black uppercase tracking-[0.2em] bg-white/[0.01] border-b border-white/5">
                  <th className="text-left px-10 py-6">操作类型</th>
                  <th className="text-left px-10 py-6">目标网络</th>
                  <th className="text-right px-10 py-6">清算金额</th>
                  <th className="text-right px-10 py-6">执行时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentTransactions.length > 0 ? recentTransactions.slice(0, 10).map((tx) => (
                  <tr key={tx.tx_hash} className="hover:bg-white/[0.03] transition-all">
                    <td className="px-10 py-6">
                      <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                        tx.tx_type === 'exit' || tx.tx_type === 'withdraw' ? 'text-danger border-danger/20 bg-danger/5' :
                        tx.tx_type === 'enter' || tx.tx_type === 'deposit' ? 'text-success border-success/20 bg-success/5' :
                        'text-accent border-accent/20 bg-accent/5'
                      }`}>
                        {TX_TYPE_LABELS[tx.tx_type] || tx.tx_type}
                      </span>
                    </td>
                    <td className="px-10 py-6">
                      <span className="text-[10px] font-black text-white uppercase tracking-widest">{tx.chain_id}</span>
                    </td>
                    <td className="px-10 py-6 text-right">
                      <div className="text-white font-black text-base font-outfit tracking-tighter">${safeNum(tx.amount_usd)}</div>
                    </td>
                    <td className="px-10 py-6 text-right text-muted text-xs font-bold font-mono">
                      {tx.created_at ? new Date(tx.created_at).toLocaleString("zh-CN") : "-"}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="px-10 py-20 text-center opacity-40">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em]">周期内无操作记录</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center pt-10 border-t border-white/5 opacity-30 text-center space-y-2">
          <p className="text-[10px] font-black text-muted uppercase tracking-[0.4em]">Quantum Matrix Financial Report</p>
          <p className="text-[9px] text-muted-strong font-bold uppercase tracking-widest">此报告由 ProfitLayer 核心引擎自动生成 · 仅供参考</p>
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
  color,
  desc,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string | null;
  color?: "success" | "danger";
  desc?: string;
}) {
  return (
    <div className="glass glass-hover p-8 rounded-[2rem] border-white/5 transition-all duration-500 group">
      <div className="flex items-center justify-between mb-6">
        <div className="p-3 rounded-2xl bg-white/5 border border-white/10 group-hover:border-accent/30 transition-all duration-500 shadow-inner">
          {icon}
        </div>
        {sub && (
          <span className="text-[10px] font-black text-danger uppercase tracking-tighter bg-danger/10 px-3 py-1 rounded-full border border-danger/20">
            {sub}
          </span>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-[10px] font-black text-muted uppercase tracking-[0.25em] opacity-60 group-hover:text-white transition-colors">{label}</p>
        <div
          className={`text-4xl font-black font-outfit tracking-tighter ${color === "success" ? "text-success" : color === "danger" ? "text-danger" : "text-white"}`}
        >
          {value}
        </div>
        {desc && (
          <p className="text-[10px] text-muted-strong font-bold uppercase tracking-widest mt-2 opacity-40 group-hover:opacity-100 transition-opacity">{desc}</p>
        )}
      </div>
    </div>
  );
}
