"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { 
  PieChart as PieChartIcon, 
  Wallet, 
  History, 
  ArrowUpRight, 
  ArrowDownLeft,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  ExternalLink,
  Briefcase,
  Activity,
  Loader2,
  RefreshCcw,
  Download,
  Power,
  X
} from "lucide-react";
import Link from "next/link";
import { formatCurrency, truncateAddress } from "../lib/utils";
import { apiFetch } from "../lib/api";
import { PageSkeleton } from "../components/Skeleton";
import { FeedbackBar } from "../components/FeedbackBar";

interface Position {
  positionId: string;
  poolId: string;
  symbol: string;
  protocolId: string;
  protocolName: string;
  protocolCategory: string;
  chain: string;
  walletAddress: string;
  strategyId: string;
  strategyName: string;
  valueUsd: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  apr: number;
  aprBase: number;
  aprReward: number;
  healthScore: number | null;
  status: string;
  openedAt: string;
  holdingDays: number;
  entryValueUsd: number | null;
  poolTvl: number | null;
  explorerUrl: string | null;
}

interface Transaction {
  txHash: string;
  chain: string;
  protocolId: string;
  txType: string;
  amountUsd: number;
  gasCostUsd: number;
  status: string;
  createdAt: string;
}

const CHAIN_ICONS: Record<string, string> = {
  ethereum: "🔹", arbitrum: "🔵", bsc: "🔶", polygon: "🟣", base: "🔵", optimism: "🔴", avalanche: "🔺", solana: "🟢", aptos: "⚪",
};

const TX_TYPE_KEYS = ["enter", "exit", "harvest", "compound", "rebalance", "deposit", "withdraw", "swap", "approve", "bridge", "supply", "borrow", "repay", "stake", "unstake"] as const;

const EXPLORER_MAP: Record<string, string> = {
  ethereum: "https://etherscan.io/tx/",
  arbitrum: "https://arbiscan.io/tx/",
  bsc: "https://bscscan.com/tx/",
  polygon: "https://polygonscan.com/tx/",
  base: "https://basescan.org/tx/",
  optimism: "https://optimistic.etherscan.io/tx/",
  solana: "https://solscan.io/tx/",
  aptos: "https://explorer.aptoslabs.com/txn/",
};

export default function PositionsPage() {
  const t = useTranslations("positions");
  const [positions, setPositions] = useState<Position[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState({ totalValue: 0, totalPnl: 0, count: 0, realizedPnl: 0 });
  const [strategyBreakdown, setStrategyBreakdown] = useState<any[]>([]);
  const [connectedWallet, setConnectedWallet] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [countdown, setCountdown] = useState(15);
  const [activeTab, setActiveTab] = useState<"active" | "closed">("active");
  const REFRESH_INTERVAL = 15;

  const fetchData = useCallback(async (isInitial = false, status: "active" | "closed" | "all" = "active") => {
    if (isInitial) setLoading(true);
    setError(null);
    const [posResult, walletResult] = await Promise.all([
      apiFetch<{ positions?: Position[]; recentTransactions?: Transaction[]; totalValue?: number; totalPnl?: number; totalRealizedPnl?: number; count?: number; roi_percentage?: number; strategyBreakdown?: any[] }>(`/api/positions?status=${status}`),
      apiFetch<{ wallets?: { evm?: string; solana?: string; aptos?: string } }>("/api/wallet"),
    ]);

    if (posResult.ok && walletResult.ok) {
      const posData = posResult.data;
      setPositions(posData.positions || []);
      setTransactions(posData.recentTransactions || []);
      setStrategyBreakdown(posData.strategyBreakdown || []);
      setStats({
        totalValue: posData.totalValue ?? 0,
        totalPnl: posData.totalPnl ?? 0,
        count: posData.count ?? 0,
        realizedPnl: posData.totalRealizedPnl ?? 0,
      });
      if (walletResult.data.wallets) {
        const w = walletResult.data.wallets;
        setConnectedWallet(w.evm || w.solana || w.aptos || "");
      }
      setLastRefreshed(new Date());
      setCountdown(REFRESH_INTERVAL);
    } else {
      const errMsg = !posResult.ok ? posResult.error : !walletResult.ok ? walletResult.error : "";
      setError(errMsg);
    }
    if (isInitial) setLoading(false);
  }, []);

  // 同步持仓数据
  const handleSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await apiFetch<{ success?: boolean; message?: string }>("/api/positions/sync", { method: "POST" });
      if (result.ok) {
        setSuccess(result.data?.message || t("syncSuccess"));
        fetchData(false, activeTab);
      } else {
        setError(result.error || t("syncFail"));
      }
    } catch (err) {
      setError(t("syncRequestFail"));
    }
    setSyncing(false);
  }, [activeTab, fetchData]);

  // 退出单个持仓
  const handleExit = useCallback(async (positionId: string) => {
    if (!confirm(t("exitConfirm"))) return;
    setError(null);
    try {
      const result = await apiFetch<{ success?: boolean; txHash?: string; error?: string }>(`/api/positions/exit`, {
        method: "POST",
        body: JSON.stringify({ positionId }),
      });
      if (result.ok) {
        const txHash = result.data?.txHash || "";
        setSuccess(`${t("exitSuccess")}: ${txHash.substring(0, 10)}...`);
        fetchData(false, activeTab);
      } else {
        setError(result.error || t("exitFail"));
      }
    } catch (err) {
      setError(t("exitRequestFail"));
    }
  }, [activeTab, fetchData]);

  // 一键清仓
  const handleExitAll = useCallback(async () => {
    const activePositions = positions.filter(p => p.status === "active");
    if (activePositions.length === 0) {
      setError(t("noActivePositions"));
      return;
    }
    if (!confirm(t("exitAllConfirm", { count: activePositions.length }))) return;
    setError(null);
    setSuccess(t("exitAllDoing"));
    try {
      const result = await apiFetch<{ success?: boolean; txHashes?: string[]; errors?: string[] }>(`/api/positions/exit-all`, {
        method: "POST",
      });
      if (result.ok) {
        const txCount = result.data?.txHashes?.length || 0;
        setSuccess(t("exitAllDone", { count: txCount }));
        fetchData(false, activeTab);
      } else {
        setError(result.error || t("exitAllFail"));
      }
    } catch (err) {
      setError(t("exitAllRequestFail"));
    }
  }, [positions, activeTab, fetchData]);

  // 导出 CSV
  const handleExportCSV = useCallback(() => {
    const headers = [t("exportProtocol"), t("exportChain"), t("exportStrategy"), t("exportValueUsd"), t("exportEntryValueUsd"), t("exportUnrealizedPnl"), t("exportApr"), t("exportHoldingDays"), t("exportStatus"), t("exportOpenedAt")];
    const rows = positions.map(p => [
      p.protocolName || p.protocolId,
      p.chain,
      p.strategyName || p.strategyId,
      p.valueUsd.toFixed(2),
      (p.entryValueUsd || 0).toFixed(2),
      p.unrealizedPnlUsd.toFixed(2),
      p.apr.toFixed(2),
      p.holdingDays.toString(),
      p.status,
      new Date(p.openedAt).toLocaleDateString(),
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `positions_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [positions, t]);

  // Tab 切换
  const handleTabChange = useCallback((tab: "active" | "closed") => {
    setActiveTab(tab);
    fetchData(false, tab);
  }, [fetchData]);

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(), REFRESH_INTERVAL * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    if (loading) return;
    const t = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? REFRESH_INTERVAL : prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [loading, lastRefreshed]);

  if (loading) return <PageSkeleton type="positions" />;

  return (
    <div className="relative min-h-screen">
      {/* 流光背景 */}
      <div className="bg-grid opacity-40" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-accent/10 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-success/5 rounded-full blur-[120px]" />
      </div>
      
      <div className="space-y-10 pb-20 animate-in fade-in duration-700 stagger-in relative z-10">
        {/* Premium 页面标题 */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-2">
          <div className="space-y-3">
            <h1 className="text-5xl font-black text-white tracking-tighter font-outfit">
              {t("title")}<span className="text-gradient-accent">{t("titleAccent")}</span>
            </h1>
            <p className="text-muted-strong text-sm max-w-xl">
              {t("subtitle")}
            </p>
          </div>
        </div>

        {/* 资产概览 */}
        <div className="flex flex-col xl:flex-row gap-8">
          <div className="flex-1 glass-cyber p-10 rounded-[2.5rem] bg-gradient-to-br from-accent/15 via-accent/5 to-transparent flex flex-col sm:flex-row items-start sm:items-center justify-between overflow-hidden relative group shadow-2xl transition-all duration-700 hover:shadow-accent/10">
            {/* Mesh Gradient 流光背景 */}
            <div className="absolute inset-0 opacity-30 pointer-events-none">
              <div className="absolute top-0 left-1/4 w-64 h-64 bg-accent/40 rounded-full blur-[100px] animate-pulse" />
              <div className="absolute bottom-0 right-1/4 w-48 h-48 bg-success/30 rounded-full blur-[80px]" />
            </div>
            <div className="absolute right-0 top-0 opacity-10 -mr-16 -mt-16 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-1000 pointer-events-none">
              <PieChartIcon className="w-80 h-80 text-white" />
            </div>
            
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-6">
                <div className="px-3 py-1 rounded-full bg-accent/20 text-accent text-[10px] font-black uppercase tracking-[0.2em] border border-accent/30 shadow-lg shadow-accent/10">
                  Portfolio Net Value
                </div>
                <span className="text-muted-strong text-[10px] font-bold flex items-center gap-2 uppercase tracking-widest bg-white/5 px-3 py-1 rounded-full">
                  <RefreshCcw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} /> 
                  Synced at {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  <span className="w-1 h-1 rounded-full bg-accent animate-pulse" />
                  Auto-refresh in {countdown}s
                </span>
              </div>
              
              <div className="flex flex-col">
                <span className="text-[11px] font-black text-white/40 uppercase tracking-[0.4em] mb-2">{t("netWorth")}</span>
                <h2 className="text-7xl font-black text-white tracking-tighter font-outfit">
                  <span className="text-white/40 font-light">$</span>{formatCurrency(stats.totalValue)}
                </h2>
              </div>

              <div className="flex items-center gap-6 mt-8">
                <div className={`flex items-center gap-2.5 px-5 py-2 rounded-2xl font-black text-sm shadow-lg ${stats.totalPnl >= 0 ? "bg-success/10 text-success border border-success/20 shadow-success/5" : "bg-danger/10 text-danger border border-danger/20 shadow-danger/5"}`}>
                  {stats.totalPnl >= 0 ? <TrendingUp className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {stats.totalPnl >= 0 ? "+" : ""}${formatCurrency(stats.totalPnl)}
                </div>
                <div className="flex flex-col">
                  <span className="text-muted-strong text-[10px] font-black uppercase tracking-widest">{t("unrealizedPnl")}</span>
                  <span className={`text-[11px] font-bold ${stats.totalPnl >= 0 ? "text-success/80" : "text-danger/80"}`}>
                    {stats.totalValue > 0 ? ((stats.totalPnl / (stats.totalValue - stats.totalPnl)) * 100).toFixed(2) : "0.00"}% All-time ROI
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-8 sm:mt-0 flex flex-col items-end relative z-10">
              <div className="flex -space-x-3 mb-8">
                {["ETH", "ARB", "SOL", "BASE"].map((i, idx) => (
                  <div key={i} 
                    className="w-14 h-14 rounded-[1.25rem] border-[3px] border-[#030406] bg-white/5 flex items-center justify-center text-[11px] font-black text-white glass hover:-translate-y-3 hover:scale-110 transition-all duration-500 cursor-pointer shadow-2xl relative"
                    style={{ zIndex: 40 - idx }}
                  >
                    {i}
                    <div className="absolute inset-0 rounded-[1.25rem] bg-accent/5 opacity-0 hover:opacity-100 transition-opacity" />
                  </div>
                ))}
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Position Count</span>
                <p className="text-2xl font-black text-white font-outfit tracking-widest bg-white/5 px-6 py-2 rounded-2xl border border-white/5">
                  {stats.count} <span className="text-xs text-muted-strong opacity-50">ACTIVE</span>
                </p>
              </div>
            </div>
          </div>

          <div className="xl:w-[400px] glass-cyber p-10 rounded-[2.5rem] flex flex-col justify-between group shadow-2xl relative overflow-hidden transition-all duration-700 hover:border-warning/20">
            <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none group-hover:rotate-12 group-hover:scale-125 transition-transform duration-1000">
              <Wallet className="w-32 h-32 text-warning" />
            </div>
            
            <div className="flex items-center justify-between mb-10 relative z-10">
              <div className="flex items-center gap-4">
                <div className="p-3.5 rounded-2xl bg-warning/10 border border-warning/20 shadow-lg shadow-warning/5">
                  <Wallet className="w-6 h-6 text-warning" />
                </div>
                <div>
                  <h3 className="text-white font-black text-base font-outfit uppercase tracking-wider">Vault Node</h3>
                  <span className="text-[9px] font-black text-success uppercase tracking-[0.2em]">Operational</span>
                </div>
              </div>
              <div className="relative flex items-center justify-center">
                <div className="absolute inset-0 bg-success/30 rounded-full animate-ping" />
                <div className="relative w-3 h-3 rounded-full bg-success border-2 border-[#030406]" />
              </div>
            </div>
            
            <div className="relative z-10 space-y-6">
              <div>
                <p className="text-muted-strong text-[9px] uppercase font-black tracking-[0.3em] mb-3 opacity-60">Connected Address</p>
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 group-hover:border-warning/20 transition-all flex items-center justify-between">
                  <p className="text-white font-mono text-sm break-all leading-tight font-bold tracking-tight">
                    {truncateAddress(connectedWallet)}
                  </p>
                  <ExternalLink className="w-3 h-3 text-muted-strong" />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                  <p className="text-[8px] font-black text-muted-strong uppercase tracking-widest mb-1">Network</p>
                  <p className="text-[10px] font-bold text-white uppercase tracking-tighter">Mainnet Cluster</p>
                </div>
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                  <p className="text-[8px] font-black text-muted-strong uppercase tracking-widest mb-1">Security</p>
                  <p className="text-[10px] font-bold text-success uppercase tracking-tighter flex items-center gap-1.5">
                    <Activity className="w-3 h-3" /> Shield On
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <FeedbackBar message={error} variant="error" onDismiss={() => setError(null)} autoDismissMs={8000} />
        )}
        {success && (
          <FeedbackBar message={success} variant="success" onDismiss={() => setSuccess(null)} autoDismissMs={5000} />
        )}

        {/* 主内容区 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* 持仓列表 */}
          <div className="lg:col-span-8 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-8 px-6">
              <div className="space-y-2">
                <h3 className="text-3xl font-black text-white tracking-tight flex items-center gap-4">
                  <Briefcase className="w-8 h-8 text-accent" /> {t("trackingTitle")} <span className="text-gradient-accent">{t("trackingAccent")}</span>
                </h3>
                <p className="text-muted-strong text-[11px] font-bold uppercase tracking-[0.3em] opacity-60">
                  Real-time position monitoring & panic-switch control
                </p>
              </div>
              
              <div className="flex flex-wrap items-center gap-4">
                {/* Tab 切换 */}
                <div className="flex bg-black/40 rounded-2xl p-1.5 border border-white/5 shadow-inner">
                  <button
                    onClick={() => handleTabChange("active")}
                    className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      activeTab === "active" ? "bg-accent text-white shadow-xl scale-105" : "text-muted-strong hover:text-white"
                    }`}
                  >
                    {t("activePositions")} ({stats.count})
                  </button>
                  <button
                    onClick={() => handleTabChange("closed")}
                    className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      activeTab === "closed" ? "bg-accent text-white shadow-xl scale-105" : "text-muted-strong hover:text-white"
                    }`}
                  >
                    {t("history")}
                  </button>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="p-3 rounded-2xl bg-white/5 hover:bg-accent/10 text-accent border border-white/5 hover:border-accent/30 transition-all disabled:opacity-50 relative group"
                    title="Force Sync"
                  >
                    <RefreshCcw className={`w-4 h-4 ${syncing ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-700"}`} />
                  </button>
                  
                  {activeTab === "active" && stats.count > 0 && (
                    <button
                      onClick={handleExitAll}
                      className="px-5 py-3 rounded-2xl bg-danger/10 hover:bg-danger/20 text-danger text-[10px] font-black uppercase tracking-widest border border-danger/20 transition-all flex items-center gap-2"
                    >
                      <Power className="w-4 h-4" />
                      Panic Exit
                    </button>
                  )}
                  
                  <button
                    onClick={handleExportCSV}
                    disabled={positions.length === 0}
                    className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-muted-strong border border-white/5 transition-all disabled:opacity-50"
                    title="Export CSV"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="glass-cyber rounded-[2.5rem] overflow-hidden shadow-2xl relative group/table">
              <div className="overflow-x-auto scrollbar-hide">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-white/30 text-[10px] font-black uppercase tracking-[0.25em] bg-white/[0.01] border-b border-white/5">
                      <th className="text-left px-10 py-7">Asset infrastructure</th>
                      <th className="text-right px-10 py-7">Equities</th>
                      <th className="text-right px-10 py-7">Performance</th>
                      <th className="text-right px-10 py-7">Yield APR</th>
                      <th className="px-10 py-7"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {positions.length > 0 ? positions.map((pos) => (
                      <tr key={pos.positionId} className="hover:bg-white/[0.03] transition-all group/tr cursor-pointer relative">
                        <td className="px-10 py-8">
                          <div className="flex items-center gap-6">
                            <div className="w-16 h-16 rounded-[1.25rem] glass bg-white/5 flex items-center justify-center text-3xl shadow-2xl border border-white/10 group-hover/tr:border-accent/40 transition-all duration-700 group-hover/tr:scale-110 group-hover/tr:rotate-3">
                              {CHAIN_ICONS[pos.chain.toLowerCase()] || "🌐"}
                            </div>
                            <div>
                              <div className="text-white font-black text-xl tracking-tight group-hover/tr:text-accent transition-colors font-outfit uppercase">{pos.symbol}</div>
                              <div className="flex items-center gap-2.5 mt-1.5">
                                <span className="text-[10px] font-black text-muted-strong uppercase tracking-widest">{pos.protocolName || pos.protocolId}</span>
                                <div className="w-1 h-1 rounded-full bg-white/20" />
                                <span className="text-[10px] font-black text-muted-strong uppercase tracking-widest">{pos.chain}</span>
                              </div>
                              {pos.strategyName && (
                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 text-[8px] font-black text-accent uppercase tracking-widest mt-2">
                                  <Activity className="w-2.5 h-2.5" />
                                  {pos.strategyName}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-8 text-right">
                          <div className="text-white font-black text-xl tracking-tighter font-outfit">${formatCurrency(pos.valueUsd)}</div>
                          <div className="text-[10px] text-muted-strong font-bold uppercase mt-1.5 tracking-widest opacity-40">
                            {pos.entryValueUsd ? `Entry: $${formatCurrency(pos.entryValueUsd)}` : 'Market Basis'}
                          </div>
                        </td>
                        <td className="px-10 py-8 text-right">
                          <div className={`font-black text-xl tracking-tighter font-outfit ${pos.unrealizedPnlUsd >= 0 ? "text-success drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]" : "text-danger drop-shadow-[0_0_15px_rgba(244,63,94,0.3)]"}`}>
                            {pos.unrealizedPnlUsd >= 0 ? "+" : ""}{formatCurrency(pos.unrealizedPnlUsd)}
                          </div>
                          <div className="flex flex-col items-end mt-1.5">
                            <span className={`text-[10px] font-black uppercase tracking-widest ${pos.unrealizedPnlUsd >= 0 ? "text-success/70" : "text-danger/70"}`}>
                              {pos.entryValueUsd && pos.entryValueUsd > 0 ? (((pos.valueUsd - pos.entryValueUsd) / pos.entryValueUsd) * 100).toFixed(2) : "0.00"}% ROI
                            </span>
                            {pos.holdingDays > 0 && (
                              <span className="text-[9px] text-muted-strong font-black uppercase tracking-tighter opacity-30 mt-0.5">{pos.holdingDays} Days Held</span>
                            )}
                          </div>
                        </td>
                        <td className="px-10 py-8 text-right">
                          <div className="inline-flex flex-col items-end gap-3">
                            <div className="px-5 py-2 rounded-2xl bg-success/10 border border-success/30 shadow-[0_0_20px_rgba(16,185,129,0.1)] group-hover/tr:bg-success/20 transition-all">
                              <span className="text-success font-black text-base font-outfit tracking-wider">{pos.apr.toFixed(2)}% APR</span>
                            </div>
                            {pos.healthScore !== null && (
                              <div className="flex flex-col items-end gap-1.5 w-full max-w-[80px]">
                                <div className="flex justify-between w-full text-[9px] font-black uppercase tracking-tighter">
                                  <span className="text-muted-strong">Health</span>
                                  <span className={pos.healthScore >= 80 ? "text-success" : pos.healthScore >= 50 ? "text-warning" : "text-danger"}>{pos.healthScore}</span>
                                </div>
                                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden p-[0.5px] border border-white/5">
                                  <div 
                                    className={`h-full rounded-full transition-all duration-1000 ${pos.healthScore >= 80 ? "bg-success" : pos.healthScore >= 50 ? "bg-warning" : "bg-danger"}`}
                                    style={{ width: `${pos.healthScore}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-10 py-8 text-right">
                          <div className="flex items-center justify-end gap-3">
                            {activeTab === "active" && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleExit(pos.positionId); }}
                                className="px-4 py-2 rounded-xl bg-danger/10 hover:bg-danger/20 text-danger text-[9px] font-black uppercase tracking-[0.2em] border border-danger/20 transition-all opacity-0 group-hover/tr:opacity-100 translate-x-4 group-hover/tr:translate-x-0"
                              >
                                Exit
                              </button>
                            )}
                            <div className="w-12 h-12 rounded-full flex items-center justify-center border border-transparent group-hover/tr:border-white/5 group-hover/tr:bg-white/5 transition-all">
                              <ChevronRight className="w-5 h-5 text-muted-strong group-hover/tr:text-accent transition-all transform group-hover/tr:translate-x-1" />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="px-10 py-40 text-center">
                          <div className="flex flex-col items-center gap-6 opacity-40">
                            <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center border border-white/5 shadow-inner">
                              <Briefcase className="w-10 h-10 text-white animate-pulse" />
                            </div>
                            <div className="space-y-2">
                              <p className="text-white font-black uppercase tracking-[0.4em] text-sm">Neural link offline</p>
                              <p className="text-muted-strong text-[10px] font-bold uppercase tracking-widest">No active positions detected in the matrix</p>
                            </div>
                            <Link
                              href="/strategies"
                              className="mt-4 px-8 py-4 bg-accent text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-2xl shadow-2xl shadow-accent/20 hover:scale-105 active:scale-95 transition-all opacity-100 flex items-center gap-3"
                            >
                              Explore Opportunities <ArrowUpRight className="w-4 h-4" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 右侧边栏 */}
          <div className="lg:col-span-4 space-y-8">
            {/* 策略分布 */}
            {activeTab === "active" && strategyBreakdown.length > 0 && (
              <section>
                <div className="flex items-center gap-4 px-4 mb-6">
                  <PieChartIcon className="w-6 h-6 text-accent" />
                  <h3 className="text-lg font-black text-white uppercase tracking-[0.3em]">Strategy Mix</h3>
                </div>

                <div className="glass-cyber rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 blur-[60px] pointer-events-none" />
                  <div className="space-y-6 relative z-10">
                    {strategyBreakdown.map((s, i) => {
                      const pct = stats.totalValue > 0 ? (s.totalAllocatedUsd / stats.totalValue) * 100 : 0;
                      return (
                        <div key={s.strategyId || i} className="group/strategy">
                          <div className="flex justify-between items-end mb-3">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Matrix Protocol</span>
                              <span className="text-xs font-black text-white uppercase tracking-wider group-hover/strategy:text-accent transition-colors">{s.strategyName || s.strategyId}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-lg font-black text-white font-outfit tracking-tighter">{pct.toFixed(1)}%</span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden p-[0.5px]">
                            <div 
                              className="h-full bg-gradient-to-r from-accent to-accent-muted rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(14,165,233,0.3)]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex justify-between mt-3">
                            <span className="text-[9px] font-black text-muted-strong uppercase tracking-widest">{s.positionCount} Nodes</span>
                            <span className={`text-[10px] font-black font-outfit ${s.totalPnlUsd >= 0 ? "text-success" : "text-danger"}`}>
                              {s.totalPnlUsd >= 0 ? "+" : ""}${s.totalPnlUsd.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {/* 活动日志 */}
            <section>
              <div className="flex items-center gap-4 px-4 mb-6">
                <History className="w-6 h-6 text-warning" />
                <h3 className="text-lg font-black text-white uppercase tracking-[0.3em]">Operational Flow</h3>
              </div>

              <div className="glass-cyber rounded-[2.5rem] p-2 shadow-2xl relative overflow-hidden">
                <div className="space-y-2 relative z-10 max-h-[800px] overflow-y-auto scrollbar-hide p-4">
                  {transactions.length > 0 ? transactions.map((tx, i) => (
                    <div key={tx.txHash + i} className="p-5 rounded-3xl hover:bg-white/[0.03] transition-all group flex items-start gap-5 border border-transparent hover:border-white/5 relative">
                      <div className={`mt-1 p-3 rounded-2xl border transition-all duration-700 shadow-lg ${
                        tx.txType.includes('exit') || tx.txType.includes('withdraw') ? "bg-danger/10 border-danger/20 text-danger scale-90 group-hover:scale-105" : 
                        tx.txType.includes('enter') || tx.txType.includes('deposit') ? "bg-success/10 border-success/20 text-success group-hover:scale-110" : 
                        "bg-accent/10 border-accent/20 text-accent"
                      }`}>
                        {tx.txType.includes('exit') || tx.txType.includes('withdraw') ? <ArrowDownLeft className="w-5 h-5" /> : 
                         tx.txType.includes('enter') || tx.txType.includes('deposit') ? <ArrowUpRight className="w-5 h-5" /> : 
                         <Activity className="w-5 h-5" />}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[10px] font-black text-white uppercase tracking-widest group-hover:text-accent transition-colors">{TX_TYPE_KEYS.includes(tx.txType as (typeof TX_TYPE_KEYS)[number]) ? t(tx.txType as (typeof TX_TYPE_KEYS)[number]) : tx.txType}</span>
                          <span className="text-[9px] text-muted-strong font-black uppercase tracking-tighter opacity-40">{new Date(tx.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-4">
                          <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">{tx.protocolId}</span>
                          <div className="w-1 h-1 rounded-full bg-white/10" />
                          <span className="text-[9px] font-bold text-muted-strong uppercase tracking-tighter">{tx.chain}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-base font-black text-white tracking-tighter font-outfit">${formatCurrency(tx.amountUsd)}</span>
                          <a 
                            href={`${EXPLORER_MAP[tx.chain.toLowerCase()] || "https://etherscan.io/tx/"}${tx.txHash}`} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="p-2 rounded-xl bg-white/5 hover:bg-accent/20 text-muted-strong hover:text-accent transition-all border border-white/5"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="p-20 text-center flex flex-col items-center gap-6 opacity-20">
                      <Activity className="w-16 h-16 text-white animate-pulse" />
                      <p className="text-white font-black uppercase tracking-[0.3em] text-[10px]">No active operations</p>
                    </div>
                  )}
                </div>
                
                {transactions.length > 0 && (
                  <button className="w-full mt-4 py-6 rounded-[2rem] border-t border-white/5 text-[10px] font-black text-muted-strong hover:text-white hover:bg-white/[0.02] uppercase tracking-[0.4em] transition-all">
                    Access Historical Matrix
                  </button>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .shadow-glow-text { text-shadow: 0 0 30px rgba(255,255,255,0.2); }
        .shadow-glow-success { box-shadow: 0 0 25px rgba(16, 185, 129, 0.1); }
      `}</style>
    </div>
  );
}
