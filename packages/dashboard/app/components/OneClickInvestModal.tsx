"use client";

import { useState, useEffect } from "react";
import { X, ArrowRight, Loader2, CheckCircle2, AlertCircle, Zap, Send, Droplets } from "lucide-react";

interface OneClickInvestProps {
  walletAddress: string;
  onClose: () => void;
}

type Step = "idle" | "crosschain-approve" | "crosschain-swap" | "liquidity-approve1" | "liquidity-approve2" | "liquidity-add" | "success" | "error";

export default function OneClickInvestModal({ walletAddress, onClose }: OneClickInvestProps) {
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHashes, setTxHashes] = useState<string[]>([]);
  
  // 配置参数
  const [usdcAmount, setUsdcAmount] = useState("98");
  const [wethAmount, setWethAmount] = useState("0.037");
  
  const steps = [
    { id: "crosschain-approve", label: "授权 USDC (Arbitrum)" },
    { id: "crosschain-swap", label: "跨链到 Base" },
    { id: "liquidity-approve1", label: "授权 WETH (Base)" },
    { id: "liquidity-approve2", label: "授权 USDC (Base)" },
    { id: "liquidity-add", label: "添加流动性" },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === step);

  // 执行单笔交易
  const executeTx = async (tx: { to: string; data: string; value: string; chainId: string }, description: string): Promise<string> => {
    const provider = (window as unknown as { okxwallet?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).okxwallet || 
                     (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
    
    if (!provider) {
      throw new Error("未检测到 OKX 钱包");
    }

    // 切换到正确的链
    const currentChainId = await provider.request({ method: "eth_chainId" }) as string;
    if (currentChainId !== tx.chainId) {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: tx.chainId }],
        });
      } catch (switchError) {
        console.warn("切链失败:", switchError);
      }
    }

    // 发送交易
    const txHash = await provider.request({
      method: "eth_sendTransaction",
      params: [{
        from: walletAddress,
        to: tx.to,
        data: tx.data,
        value: tx.value,
      }],
    }) as string;

    console.log(`[${description}] txHash:`, txHash);
    return txHash;
  };

  // 等待交易确认
  const waitForTx = async (txHash: string, chainId: string): Promise<void> => {
    const rpcUrls: Record<string, string> = {
      "0xa4b1": "https://1rpc.io/arb",
      "0x2105": "https://1rpc.io/base",
    };
    
    const rpc = rpcUrls[chainId] || "https://1rpc.io/arb";
    
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getTransactionReceipt",
          params: [txHash],
          id: 1,
        }),
      });
      
      const data = await res.json();
      if (data.result && data.result.status === "0x1") {
        return;
      }
      if (data.result && data.result.status === "0x0") {
        throw new Error("交易失败");
      }
    }
    
    throw new Error("交易确认超时");
  };

  // 一键执行
  const executeAll = async () => {
    setError(null);
    const hashes: string[] = [];

    try {
      // Step 1: 获取跨链交易数据
      setStep("crosschain-approve");
      const crosschainRes = await fetch("/api/crosschain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromChain: "arbitrum",
          toChain: "base",
          token: "USDC",
          amount: usdcAmount,
          walletAddress,
        }),
      });
      const crosschainData = await crosschainRes.json();
      
      if (!crosschainData.success) {
        throw new Error(crosschainData.error || "获取跨链交易失败");
      }

      // 执行跨链 approve
      const approveHash = await executeTx(crosschainData.transactions[0].tx, "USDC Approve");
      hashes.push(approveHash);
      setTxHashes([...hashes]);
      await waitForTx(approveHash, crosschainData.transactions[0].tx.chainId);

      // 执行跨链 swap
      setStep("crosschain-swap");
      const swapHash = await executeTx(crosschainData.transactions[1].tx, "Stargate Swap");
      hashes.push(swapHash);
      setTxHashes([...hashes]);
      await waitForTx(swapHash, crosschainData.transactions[1].tx.chainId);

      // 等待跨链完成 (预估 2 分钟)
      await new Promise(r => setTimeout(r, 120000));

      // Step 2: 获取添加流动性交易数据
      setStep("liquidity-approve1");
      const liquidityRes = await fetch("/api/add-liquidity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenA: "WETH",
          tokenB: "USDC",
          amountA: wethAmount,
          amountB: usdcAmount,
          walletAddress,
        }),
      });
      const liquidityData = await liquidityRes.json();
      
      if (!liquidityData.success) {
        throw new Error(liquidityData.error || "获取流动性交易失败");
      }

      // 执行 WETH approve
      const wethApproveHash = await executeTx(liquidityData.transactions[0].tx, "WETH Approve");
      hashes.push(wethApproveHash);
      setTxHashes([...hashes]);
      await waitForTx(wethApproveHash, liquidityData.transactions[0].tx.chainId);

      // 执行 USDC approve
      setStep("liquidity-approve2");
      const usdcApproveHash = await executeTx(liquidityData.transactions[1].tx, "USDC Approve");
      hashes.push(usdcApproveHash);
      setTxHashes([...hashes]);
      await waitForTx(usdcApproveHash, liquidityData.transactions[1].tx.chainId);

      // 执行添加流动性
      setStep("liquidity-add");
      const addLiqHash = await executeTx(liquidityData.transactions[2].tx, "Add Liquidity");
      hashes.push(addLiqHash);
      setTxHashes([...hashes]);
      await waitForTx(addLiqHash, liquidityData.transactions[2].tx.chainId);

      setStep("success");

    } catch (err) {
      console.error("执行失败:", err);
      setError((err as Error).message);
      setStep("error");
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={onClose} />
      
      <div className="relative w-full max-w-lg mx-4 glass rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-300">
        {/* 顶部渐变条 */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent via-purple-500 to-pink-500" />
        
        {/* 头部 */}
        <div className="p-8 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-accent/20 flex items-center justify-center border border-accent/30">
                <Zap className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h2 className="text-white font-black text-xl tracking-tight">一键跨链投资</h2>
                <p className="text-muted text-[11px] font-bold uppercase tracking-widest mt-1">Arbitrum → Base WETH-USDC</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 transition-colors">
              <X className="w-5 h-5 text-muted" />
            </button>
          </div>
        </div>

        {/* 内容区 */}
        <div className="p-8">
          {step === "idle" && (
            <div className="space-y-6">
              {/* 金额配置 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                  <p className="text-[10px] text-muted font-bold uppercase tracking-widest mb-2">跨链 USDC</p>
                  <input
                    type="number"
                    value={usdcAmount}
                    onChange={(e) => setUsdcAmount(e.target.value)}
                    className="w-full bg-transparent text-white text-2xl font-black focus:outline-none"
                  />
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                  <p className="text-[10px] text-muted font-bold uppercase tracking-widest mb-2">配对 WETH</p>
                  <input
                    type="number"
                    value={wethAmount}
                    onChange={(e) => setWethAmount(e.target.value)}
                    className="w-full bg-transparent text-white text-2xl font-black focus:outline-none"
                    step="0.001"
                  />
                </div>
              </div>

              {/* 流程预览 */}
              <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-3">
                <p className="text-[10px] text-muted font-bold uppercase tracking-widest">执行流程</p>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="px-2 py-1 rounded bg-blue-500/20 text-blue-400 font-bold">Arbitrum</span>
                  <ArrowRight className="w-3 h-3 text-muted" />
                  <span className="text-muted">跨链 {usdcAmount} USDC</span>
                  <ArrowRight className="w-3 h-3 text-muted" />
                  <span className="px-2 py-1 rounded bg-purple-500/20 text-purple-400 font-bold">Base</span>
                  <ArrowRight className="w-3 h-3 text-muted" />
                  <span className="text-muted">投资 LP</span>
                </div>
              </div>

              {/* 执行按钮 */}
              <button
                onClick={executeAll}
                className="w-full flex items-center justify-center gap-3 py-5 bg-accent hover:bg-accent/90 rounded-2xl text-white text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-accent/20"
              >
                <Zap className="w-4 h-4" />
                开始执行
              </button>
              
              <p className="text-center text-[10px] text-muted">
                将自动执行 5 笔交易，每笔需在 OKX 钱包确认
              </p>
            </div>
          )}

          {step !== "idle" && step !== "success" && step !== "error" && (
            <div className="space-y-6">
              {/* 进度条 */}
              <div className="space-y-3">
                {steps.map((s, idx) => {
                  const isActive = s.id === step;
                  const isDone = idx < currentStepIndex;
                  
                  return (
                    <div key={s.id} className={`flex items-center gap-4 p-3 rounded-xl transition-all ${isActive ? "bg-accent/10 border border-accent/30" : isDone ? "bg-success/5" : "opacity-40"}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDone ? "bg-success/20" : isActive ? "bg-accent/20" : "bg-white/5"}`}>
                        {isDone ? (
                          <CheckCircle2 className="w-4 h-4 text-success" />
                        ) : isActive ? (
                          <Loader2 className="w-4 h-4 text-accent animate-spin" />
                        ) : (
                          <span className="text-[10px] text-muted font-bold">{idx + 1}</span>
                        )}
                      </div>
                      <span className={`text-sm font-bold ${isActive ? "text-white" : isDone ? "text-success" : "text-muted"}`}>
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              
              <p className="text-center text-[11px] text-muted">
                {step === "crosschain-swap" ? "跨链中，预计 1-3 分钟..." : "请在 OKX 钱包中确认交易"}
              </p>
            </div>
          )}

          {step === "success" && (
            <div className="text-center py-8">
              <div className="w-20 h-20 rounded-3xl bg-success/20 flex items-center justify-center mx-auto mb-6 border border-success/30">
                <CheckCircle2 className="w-10 h-10 text-success" />
              </div>
              <p className="text-success font-black text-2xl mb-2">投资成功!</p>
              <p className="text-muted text-sm mb-6">已成功添加 WETH-USDC 流动性</p>
              <button
                onClick={onClose}
                className="px-8 py-3 bg-success/20 text-success font-bold rounded-xl hover:bg-success/30 transition-colors"
              >
                完成
              </button>
            </div>
          )}

          {step === "error" && (
            <div className="text-center py-8">
              <div className="w-20 h-20 rounded-3xl bg-danger/20 flex items-center justify-center mx-auto mb-6 border border-danger/30">
                <AlertCircle className="w-10 h-10 text-danger" />
              </div>
              <p className="text-danger font-black text-xl mb-2">执行失败</p>
              <p className="text-muted text-sm mb-6">{error}</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setStep("idle")}
                  className="px-6 py-3 bg-white/5 text-white font-bold rounded-xl hover:bg-white/10 transition-colors"
                >
                  重试
                </button>
                <button
                  onClick={onClose}
                  className="px-6 py-3 bg-danger/20 text-danger font-bold rounded-xl hover:bg-danger/30 transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
