"use client";

import { useState } from "react";
import { Zap, ShieldCheck, Copy, Eye, EyeOff, RefreshCw, ArrowRightLeft } from "lucide-react";

/**
 * 路径 B：热钱包管理中心
 * 用于生成执行钱包私钥，并指导用户进行资金授权（划转）
 */
export default function HotWalletManager() {
  const [wallets, setWallets] = useState({
    evm: { address: "0x71C...8E2A", balance: "1.25 ETH" },
    solana: { address: "GvH...9Zpq", balance: "45.2 SOL" },
    aptos: { address: "0x3a...f12b", balance: "120 APT" },
  });
  const [showKeys, setShowKeys] = useState(false);

  const generateNewWallet = (chain: string) => {
    // 這裡會調用後端 API 生成新的加密私鑰對
    console.log(`Generating new wallet for ${chain}`);
  };

  return (
    <div className="glass p-8 rounded-[2.5rem] border-white/5 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
        <Zap className="w-32 h-32 text-accent" />
      </div>

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-widest flex items-center gap-2">
              <Zap className="w-5 h-5 text-accent" /> 执行钱包 (Hot Wallet)
            </h3>
            <p className="text-[10px] text-muted font-bold uppercase mt-1">当前处于：路径 B 全自动模式</p>
          </div>
          <button 
            onClick={() => setShowKeys(!showKeys)}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all text-muted hover:text-white"
          >
            {showKeys ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        <div className="space-y-4">
          {Object.entries(wallets).map(([chain, data]) => (
            <div key={chain} className="p-4 rounded-3xl bg-black/40 border border-white/5 group hover:border-accent/30 transition-all">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center text-[10px] font-black text-accent uppercase">
                    {chain[0]}
                  </div>
                  <div>
                    <p className="text-xs font-black text-white uppercase tracking-tight">{chain} Executor</p>
                    <p className="text-[10px] text-muted font-mono">{data.address}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-success">{data.balance}</p>
                  <p className="text-[9px] text-muted font-bold uppercase">实时余额</p>
                </div>
              </div>

              {showKeys && (
                <div className="mb-4 p-3 rounded-xl bg-danger/5 border border-danger/10">
                  <p className="text-[9px] text-danger font-bold uppercase mb-1">Encrypted Private Key</p>
                  <p className="text-[10px] text-white font-mono break-all opacity-60 italic">****************************************</p>
                </div>
              )}

              <div className="flex gap-2">
                <button className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-white/5 text-[10px] font-black text-white uppercase hover:bg-white/10 transition-all">
                  <ArrowRightLeft className="w-3 h-3" /> 划转资金 (从冷钱包)
                </button>
                <button className="px-4 py-2 rounded-xl bg-white/5 text-[10px] font-black text-muted uppercase hover:text-accent transition-all">
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 p-6 rounded-3xl bg-accent/5 border border-accent/10">
          <h4 className="text-xs font-black text-accent uppercase tracking-widest mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> 自动利润归集 (Profit Sweep)
          </h4>
          <p className="text-[10px] text-muted leading-relaxed font-medium mb-4">
            系统会保留运作资金，超出部分的利润将自动转入您的冷钱包：
            <span className="text-white font-mono ml-1 underline">0xCold...Wallet</span>
          </p>
          <div className="flex items-center justify-between text-[10px] font-bold text-muted uppercase">
            <span>归集阈值: $1,000</span>
            <button className="text-accent hover:underline">修改设置</button>
          </div>
        </div>
      </div>
    </div>
  );
}
