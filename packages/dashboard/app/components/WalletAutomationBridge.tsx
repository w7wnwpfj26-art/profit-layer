"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ShieldCheck, Cpu, AlertCircle, Loader2, Check, X,
  ExternalLink, Zap, Clock, AlertTriangle,
} from "lucide-react";
import { apiFetch } from "../lib/api";

interface PendingTx {
  id: string;
  chain_id: number;
  tx_type: string;
  amount_usd: number;
  payload: string;
  status: string;
  created_at: string;
}

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum", 42161: "Arbitrum", 8453: "Base",
  10: "Optimism", 137: "Polygon", 56: "BNB Chain",
};

const TX_LABELS: Record<string, string> = {
  approve: "代币授权", supply: "存入协议",
  withdraw: "从协议提取", swap: "代币兑换",
  bridge: "跨链转账",
};

export default function WalletAutomationBridge() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [pendingTxs, setPendingTxs] = useState<PendingTx[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [txResults, setTxResults] = useState<Record<string, { ok: boolean; msg: string }>>({});

  // 轮询待签名队列（仅启用时）
  const fetchQueue = useCallback(async () => {
    const res = await apiFetch<{ queue: PendingTx[] }>("/api/wallet/bridge");
    if (res.ok) setPendingTxs(res.data.queue || []);
  }, []);

  useEffect(() => {
    if (!isEnabled) return;
    fetchQueue();
    const t = setInterval(fetchQueue, 4000);
    return () => clearInterval(t);
  }, [isEnabled, fetchQueue]);

  // 用户点击「确认签名」后执行
  const handleConfirm = async (tx: PendingTx) => {
    setConfirming(null);
    setProcessing(tx.id);
    try {
      const okx = (window as any).okxwallet || (window as any).ethereum;
      if (!okx) throw new Error("未检测到 OKX 钱包插件");

      const payload = typeof tx.payload === "string" ? JSON.parse(tx.payload) : tx.payload;

      // 切换链
      const hex = await okx.request({ method: "eth_chainId" });
      if (parseInt(hex, 16) !== tx.chain_id) {
        await okx.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${tx.chain_id.toString(16)}` }],
        });
      }

      const txHash = await okx.request({ method: "eth_sendTransaction", params: [payload] });

      await apiFetch("/api/wallet/bridge", {
        method: "POST",
        body: JSON.stringify({ id: tx.id, txHash, action: "broadcasted" }),
      });

      setTxResults(prev => ({ ...prev, [tx.id]: { ok: true, msg: `Hash: ${String(txHash).slice(0, 14)}...` } }));
      setPendingTxs(prev => prev.filter(t => t.id !== tx.id));
    } catch (err: any) {
      const isRejected = err.code === 4001 || err.message?.includes("reject") || err.message?.includes("denied");
      if (isRejected) {
        await apiFetch("/api/wallet/bridge", {
          method: "POST", body: JSON.stringify({ id: tx.id, action: "reject" }),
        });
        setPendingTxs(prev => prev.filter(t => t.id !== tx.id));
        setTxResults(prev => ({ ...prev, [tx.id]: { ok: false, msg: "已取消" } }));
      } else {
        setTxResults(prev => ({ ...prev, [tx.id]: { ok: false, msg: err.message || "签名失败" } }));
      }
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (tx: PendingTx) => {
    setConfirming(null);
    await apiFetch("/api/wallet/bridge", {
      method: "POST", body: JSON.stringify({ id: tx.id, action: "reject" }),
    });
    setPendingTxs(prev => prev.filter(t => t.id !== tx.id));
  };

  return (
    <div className={`glass-cyber p-8 rounded-[2.5rem] border transition-all duration-500 ${
      isEnabled ? "border-accent/30 shadow-[0_0_40px_rgba(14,165,233,0.1)]" : "border-white/5"
    }`}>
      {/* 头部 */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-2xl transition-all ${isEnabled ? "bg-accent/15 border border-accent/30" : "bg-white/5"}`}>
            <ShieldCheck className={`w-5 h-5 ${isEnabled ? "text-accent" : "text-muted"}`} />
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-widest font-outfit">自动化签名桥接</h3>
            <div className="flex items-center gap-2 mt-1">
              <div className={`w-1.5 h-1.5 rounded-full ${isEnabled ? (pendingTxs.length > 0 ? "bg-warning animate-pulse" : "bg-success animate-pulse") : "bg-white/20"}`} />
              <p className="text-[9px] text-muted font-bold uppercase tracking-widest">
                {isEnabled ? (processing ? "签名中..." : pendingTxs.length > 0 ? `${pendingTxs.length} 笔待签名` : "监听中") : "已关闭"}
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={() => { setIsEnabled(!isEnabled); setPendingTxs([]); setTxResults({}); }}
          className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
            isEnabled
              ? "bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20"
              : "bg-accent text-white shadow-lg shadow-accent/20 hover:bg-accent/90"
          }`}
        >
          {isEnabled ? "停止" : "启动"}
        </button>
      </div>

      {/* 安全提示（关闭时显示） */}
      {!isEnabled && (
        <div className="p-5 rounded-2xl bg-warning/5 border border-warning/10 flex gap-4">
          <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-[10px] text-warning font-black uppercase tracking-wider">安全说明</p>
            <p className="text-[10px] text-warning/70 leading-relaxed">
              启用后，AI 生成的链上交易将推入队列等待您确认。<strong className="text-warning">每笔交易均需您手动审核并在 OKX 钱包中点击确认</strong>，系统不会自动执行任何链上操作。
            </p>
          </div>
        </div>
      )}

      {/* 队列列表 */}
      {isEnabled && (
        <div className="space-y-4">
          {pendingTxs.length === 0 && Object.keys(txResults).length === 0 && (
            <div className="flex flex-col items-center py-10 text-center">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4 border border-white/5">
                <Cpu className="w-5 h-5 text-muted opacity-30" />
              </div>
              <p className="text-[9px] text-muted font-black uppercase tracking-widest">队列为空，等待 AI 下发任务...</p>
            </div>
          )}

          {/* 最近执行结果 */}
          {Object.entries(txResults).slice(-2).map(([id, result]) => (
            <div key={id} className={`flex items-center gap-3 p-4 rounded-2xl text-[10px] font-bold ${
              result.ok ? "bg-success/5 border border-success/20 text-success" : "bg-danger/5 border border-danger/20 text-danger"
            }`}>
              {result.ok ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
              {result.ok ? `交易已广播 · ${result.msg}` : `操作失败 · ${result.msg}`}
            </div>
          ))}

          {/* 待签名列表 */}
          {pendingTxs.map((tx) => {
            const payload = typeof tx.payload === "string" ? JSON.parse(tx.payload) : tx.payload;
            const isProcessing = processing === tx.id;
            const isConfirming = confirming === tx.id;

            return (
              <div key={tx.id} className={`rounded-[1.5rem] border transition-all duration-300 ${
                isProcessing ? "border-accent/50 bg-accent/5 shadow-lg shadow-accent/10" :
                isConfirming ? "border-warning/50 bg-warning/5 shadow-lg shadow-warning/10" :
                "border-white/10 bg-white/[0.02] hover:border-white/20"
              }`}>
                {/* 交易摘要 */}
                <div className="p-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    {isProcessing ? (
                      <Loader2 className="w-4 h-4 text-accent animate-spin shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-xl bg-warning/10 border border-warning/20 flex items-center justify-center shrink-0">
                        <Zap className="w-4 h-4 text-warning" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black text-warning uppercase tracking-wider">
                          {TX_LABELS[tx.tx_type] || tx.tx_type}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-white/5 text-[9px] text-muted font-mono">
                          {CHAIN_NAMES[tx.chain_id] || `Chain ${tx.chain_id}`}
                        </span>
                      </div>
                      {tx.amount_usd > 0 && (
                        <p className="text-sm font-black text-white font-outfit">${tx.amount_usd.toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] text-muted shrink-0">
                    <Clock className="w-3 h-3" />
                    {new Date(tx.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>

                {/* 展开详情（二次确认前显示） */}
                {isConfirming && (
                  <div className="px-5 pb-5 space-y-4 border-t border-warning/20 pt-4">
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-warning/10 border border-warning/20">
                      <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                      <p className="text-[10px] text-warning/90 font-bold leading-relaxed">
                        请在 OKX 钱包弹窗中仔细核对目标地址和金额后再点击确认。链上交易不可撤销。
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-black/40 font-mono text-[9px] text-muted break-all border border-white/5">
                      <span className="text-white/40 text-[8px] block mb-1 uppercase tracking-widest">目标合约</span>
                      {payload?.to || "—"}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleConfirm(tx)}
                        className="flex-1 py-3 rounded-2xl bg-warning text-black text-[10px] font-black uppercase tracking-widest hover:bg-warning/90 transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-warning/20"
                      >
                        <Check className="w-4 h-4" /> 确认签名
                      </button>
                      <button
                        onClick={() => handleReject(tx)}
                        className="flex-1 py-3 rounded-2xl bg-white/10 text-white/60 text-[10px] font-black uppercase tracking-widest hover:bg-danger/10 hover:text-danger transition-all active:scale-95"
                      >
                        拒绝
                      </button>
                    </div>
                  </div>
                )}

                {/* 操作按钮（未展开时） */}
                {!isConfirming && !isProcessing && (
                  <div className="px-5 pb-5 flex gap-2">
                    <button
                      onClick={() => setConfirming(tx.id)}
                      className="flex-1 py-2.5 rounded-2xl bg-accent/10 border border-accent/20 text-accent text-[10px] font-black uppercase tracking-widest hover:bg-accent/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> 查看并签名
                    </button>
                    <button
                      onClick={() => handleReject(tx)}
                      className="px-5 py-2.5 rounded-2xl bg-white/5 text-muted text-[10px] font-black uppercase tracking-widest hover:bg-danger/10 hover:text-danger transition-all"
                    >
                      忽略
                    </button>
                  </div>
                )}

                {isProcessing && (
                  <div className="px-5 pb-5">
                    <p className="text-[10px] text-accent font-bold text-center animate-pulse">等待 OKX 钱包确认...</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
