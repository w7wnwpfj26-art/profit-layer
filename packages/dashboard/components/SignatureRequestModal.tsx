"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Check, X, Loader2, Wallet, Minimize2 } from "lucide-react";

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
  1: "Ethereum",
  42161: "Arbitrum",
  8453: "Base",
  10: "Optimism",
  137: "Polygon",
  56: "BNB Chain",
};

const TX_TYPE_LABELS: Record<string, string> = {
  approve: "代币授权",
  supply: "存入协议",
  withdraw: "从协议提取",
  swap: "代币兑换",
};

export default function SignatureRequestModal() {
  const [pendingTxs, setPendingTxs] = useState<PendingTx[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);

  // 轮询待签名交易
  const fetchPendingTxs = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet/bridge");
      const data = await res.json();
      if (data.queue) {
        setPendingTxs(data.queue);
      }
    } catch (err) {
      console.error("获取待签名交易失败:", err);
    }
  }, []);

  useEffect(() => {
    fetchPendingTxs();
    const interval = setInterval(fetchPendingTxs, 3000);
    return () => clearInterval(interval);
  }, [fetchPendingTxs]);

  // 签名并发送交易
  const handleSign = async (tx: PendingTx) => {
    setProcessing(tx.id);
    setError(null);
    setSuccess(null);

    try {
      const okxwallet = (window as any).okxwallet || (window as any).ethereum;
      if (!okxwallet) {
        throw new Error("未检测到 OKX 钱包，请安装 OKX Wallet 插件");
      }

      const payload = typeof tx.payload === "string" ? JSON.parse(tx.payload) : tx.payload;
      const currentChainHex = await okxwallet.request({ method: "eth_chainId" });
      const currentChainId = parseInt(currentChainHex, 16);
      const targetChainId = tx.chain_id;

      if (currentChainId !== targetChainId) {
        try {
          await okxwallet.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${targetChainId.toString(16)}` }],
          });
        } catch {
          throw new Error(`请在 OKX 钱包中切换到 ${CHAIN_NAMES[targetChainId]} 网络`);
        }
      }

      console.log("发送交易请求:", payload);
      const txHash = await okxwallet.request({
        method: "eth_sendTransaction",
        params: [payload],
      });

      console.log("交易已广播:", txHash);

      await fetch("/api/wallet/bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tx.id, txHash, action: "broadcasted" }),
      });

      setSuccess(`交易成功！Hash: ${txHash.slice(0, 10)}...`);
      setPendingTxs((prev) => prev.filter((t) => t.id !== tx.id));

    } catch (err: any) {
      console.error("签名失败:", err);
      
      if (err.code === 4001 || err.message?.includes("reject") || err.message?.includes("denied")) {
        setError("用户取消了交易");
        await fetch("/api/wallet/bridge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: tx.id, action: "reject" }),
        });
        setPendingTxs((prev) => prev.filter((t) => t.id !== tx.id));
      } else {
        setError(err.message || "签名失败");
      }
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (tx: PendingTx) => {
    try {
      await fetch("/api/wallet/bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tx.id, action: "reject" }),
      });
      setPendingTxs((prev) => prev.filter((t) => t.id !== tx.id));
    } catch (err) {
      console.error("拒绝交易失败:", err);
    }
  };

  if (pendingTxs.length === 0) return null;

  if (isMinimized) {
    return (
      <div onClick={() => setIsMinimized(false)} className="fixed bottom-8 right-8 z-50 cursor-pointer group">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-warning flex items-center justify-center shadow-[0_20px_40px_rgba(245,158,11,0.3)] animate-float ring-4 ring-warning/10 group-hover:scale-110 transition-transform duration-500">
            <Wallet className="w-7 h-7 text-black" />
          </div>
          <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-white border-4 border-[#030406] flex items-center justify-center text-[11px] font-black text-black shadow-lg">
            {pendingTxs.length}
          </div>
          <div className="absolute right-full mr-4 top-1/2 -translate-y-1/2 px-4 py-2 bg-white text-black text-[10px] font-black uppercase tracking-widest rounded-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl">
            待确认签名 ({pendingTxs.length})
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 max-h-[500px] overflow-hidden">
      <div className="glass-cyber rounded-3xl border-2 border-warning/30 shadow-2xl shadow-warning/10 bg-gradient-to-br from-warning/5 to-transparent">
        <div className="flex items-center justify-between p-4 border-b border-warning/20 bg-warning/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warning/20 flex items-center justify-center ring-1 ring-warning/30">
              <Wallet className="w-5 h-5 text-warning" />
            </div>
            <div>
              <h3 className="text-warning font-black font-outfit uppercase tracking-wider">待签名交易</h3>
              <p className="text-warning/70 text-xs font-bold">{pendingTxs.length} 笔等待确认 · 请仔细核对</p>
            </div>
          </div>
          <button onClick={() => setIsMinimized(true)} className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition">
            <X className="w-4 h-4 text-white/50" />
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-4 p-3 rounded-xl bg-danger/10 border border-danger/20 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-danger" />
            <span className="text-danger text-sm">{error}</span>
          </div>
        )}
        {success && (
          <div className="mx-4 mt-4 p-3 rounded-xl bg-success/10 border border-success/20 flex items-center gap-2">
            <Check className="w-4 h-4 text-success" />
            <span className="text-success text-sm">{success}</span>
          </div>
        )}

        <div className="p-4 space-y-3 max-h-[300px] overflow-y-auto">
          {pendingTxs.map((tx) => {
            const payload = typeof tx.payload === "string" ? JSON.parse(tx.payload) : tx.payload;
            return (
              <div key={tx.id} className="p-4 rounded-2xl bg-warning/5 border border-warning/20 hover:border-warning/40 transition">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 rounded-lg bg-warning/20 text-warning text-xs font-bold">
                      {TX_TYPE_LABELS[tx.tx_type] || tx.tx_type}
                    </span>
                    <span className="text-white/50 text-xs">
                      {CHAIN_NAMES[tx.chain_id] || `Chain ${tx.chain_id}`}
                    </span>
                  </div>
                  {tx.amount_usd > 0 && <span className="text-white font-bold">${tx.amount_usd.toLocaleString()}</span>}
                </div>
                <div className="text-xs text-white/40 mb-3 font-mono break-all">To: {payload.to?.slice(0, 20)}...</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSign(tx)}
                    disabled={processing === tx.id}
                    className="flex-1 py-2 rounded-xl bg-warning text-black text-sm font-bold hover:bg-warning/90 disabled:opacity-50 flex items-center justify-center gap-2 transition shadow-lg shadow-warning/20"
                  >
                    {processing === tx.id ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> 确认中...</>
                    ) : (
                      <><Check className="w-4 h-4" /> 确认签名</>
                    )}
                  </button>
                  <button
                    onClick={() => handleReject(tx)}
                    disabled={processing === tx.id}
                    className="px-4 py-2 rounded-xl bg-white/10 text-white/70 text-sm font-bold hover:bg-white/20 disabled:opacity-50 transition"
                  >
                    拒绝
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
