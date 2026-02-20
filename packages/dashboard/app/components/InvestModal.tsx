"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Wallet,
  ArrowRight,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Zap,
  TrendingUp,
  ArrowLeftRight,
  ExternalLink,
  Rocket,
  Shield,
} from "lucide-react";

interface Pool {
  poolId: string;
  protocolId: string;
  chain: string;
  symbol: string;
  aprTotal: number;
  tvlUsd: number;
  healthScore: number | null;
  riskLevel: string;
}

interface TokenBalance {
  symbol: string;
  balance: number;
  usdValue: number;
}

interface InvestModalProps {
  pool: Pool;
  onClose: () => void;
  walletAddress?: string;
}

// 链 -> RPC 映射
const CHAIN_RPC: Record<string, string> = {
  ethereum: "https://eth.llamarpc.com",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  base: "https://mainnet.base.org",
  polygon: "https://polygon-rpc.com",
  bsc: "https://bsc-dataseed.binance.org",
  optimism: "https://mainnet.optimism.io",
};

// 链 -> 原生代币
const CHAIN_NATIVE: Record<string, string> = {
  ethereum: "ETH",
  arbitrum: "ETH",
  base: "ETH",
  polygon: "MATIC",
  bsc: "BNB",
  optimism: "ETH",
};

// 链 -> DEX 聚合器 URL
const SWAP_URLS: Record<string, string> = {
  ethereum: "https://app.1inch.io/#/1/simple/swap/ETH",
  arbitrum: "https://app.1inch.io/#/42161/simple/swap/ETH",
  base: "https://app.1inch.io/#/8453/simple/swap/ETH",
  polygon: "https://app.1inch.io/#/137/simple/swap/MATIC",
  bsc: "https://app.1inch.io/#/56/simple/swap/BNB",
  optimism: "https://app.1inch.io/#/10/simple/swap/ETH",
};

// 解析池子 symbol 获取需要的代币
function parseRequiredTokens(symbol: string): string[] {
  // 常见格式: "USDC-WETH", "USDC/ETH", "stETH", "aUSDC"
  const cleaned = symbol
    .replace(/^(a|st|w|r|s)/, "") // 移除前缀
    .toUpperCase();
  
  if (cleaned.includes("-")) return cleaned.split("-");
  if (cleaned.includes("/")) return cleaned.split("/");
  return [cleaned];
}

export default function InvestModal({ pool, onClose, walletAddress }: InvestModalProps) {
  const [step, setStep] = useState<"check" | "ready" | "swap" | "invest" | "success">("check");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [requiredTokens, setRequiredTokens] = useState<string[]>([]);
  const [missingTokens, setMissingTokens] = useState<string[]>([]);
  const [investAmount, setInvestAmount] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 检查钱包余额
  const checkBalances = useCallback(async () => {
    if (!walletAddress) {
      setError("请先连接钱包");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 获取钱包余额
      const res = await fetch(`/api/wallet/balance?address=${walletAddress}`);
      const data = await res.json();

      if (!data.success) {
        setError("获取余额失败");
        setLoading(false);
        return;
      }

      // 解析需要的代币
      const tokens = parseRequiredTokens(pool.symbol);
      setRequiredTokens(tokens);

      // 提取所有链的余额
      const allBalances: TokenBalance[] = [];
      for (const chain of data.chainBalances || []) {
        for (const token of chain.tokens || []) {
          allBalances.push({
            symbol: token.symbol.toUpperCase(),
            balance: parseFloat(token.balance) || 0,
            usdValue: token.usdValue || 0,
          });
        }
      }
      setBalances(allBalances);

      // 检查缺少的代币
      const missing: string[] = [];
      for (const token of tokens) {
        const found = allBalances.find(
          (b) => b.symbol === token || b.symbol === `W${token}` || `W${b.symbol}` === token
        );
        if (!found || found.balance < 0.001) {
          missing.push(token);
        }
      }
      setMissingTokens(missing);

      // 设置下一步
      if (missing.length > 0) {
        setStep("swap");
      } else {
        setStep("ready");
      }
    } catch (err) {
      console.error("Balance check failed:", err);
      setError("余额检查失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [walletAddress, pool.symbol]);

  useEffect(() => {
    checkBalances();
  }, [checkBalances]);

  // 触发投资
  const handleInvest = async () => {
    if (!investAmount || parseFloat(investAmount) <= 0) {
      setError("请输入投资金额");
      return;
    }

    setStep("invest");
    setLoading(true);

    try {
      // 调用投资 API
      const res = await fetch("/api/invest-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: walletAddress,
          chain: pool.chain,
          poolId: pool.poolId,
          amount: investAmount,
        }),
      });

      const data = await res.json();

      if (data.success || data.message?.includes("已创建")) {
        setStep("success");
      } else {
        setError(data.error || "投资请求失败");
        setStep("ready");
      }
    } catch (err) {
      console.error("Invest failed:", err);
      setError("投资请求失败");
      setStep("ready");
    } finally {
      setLoading(false);
    }
  };

  // 打开兑换页面
  const openSwapPage = (token: string) => {
    const swapUrl = SWAP_URLS[pool.chain] || SWAP_URLS.ethereum;
    window.open(`${swapUrl}/${token}`, "_blank");
  };

  // 获取用户在目标链上的原生代币余额
  const getNativeBalance = () => {
    const native = CHAIN_NATIVE[pool.chain] || "ETH";
    const found = balances.find((b) => b.symbol === native || b.symbol === `W${native}`);
    return found?.usdValue || 0;
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />

      {/* 模态框 */}
      <div className="relative w-full max-w-lg glass rounded-[2.5rem] p-8 border border-white/10 shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden">
        {/* 背景装饰 */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-accent/10 blur-[100px] rounded-full pointer-events-none" />
        
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted hover:text-white transition-all z-20"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 头部 */}
        <div className="mb-8 relative z-10">
          <div className="flex items-center gap-2 text-[10px] font-black text-accent uppercase tracking-[0.2em] mb-2">
            <Zap className="w-4 h-4 fill-accent/50" />
            一键投资
          </div>
          <h2 className="text-3xl font-black text-white tracking-tight">{pool.symbol}</h2>
          <p className="text-muted text-xs font-bold mt-1 uppercase tracking-widest opacity-60">
            {pool.protocolId} · {pool.chain.toUpperCase()}
          </p>
        </div>

        {/* 池子信息 */}
        <div className="bg-white/5 rounded-3xl p-6 mb-8 border border-white/5 relative z-10 shadow-inner">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] mb-1 opacity-60">预期年化 (APY)</p>
              <p className="text-3xl font-black text-success drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]">{pool.aprTotal.toFixed(2)}%</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] mb-1 opacity-60">安全评分</p>
              <p className={`text-3xl font-black tracking-tighter ${(pool.healthScore ?? 0) >= 70 ? "text-success" : "text-warning"}`}>
                {pool.healthScore?.toFixed(0) || "N/A"}
              </p>
            </div>
          </div>
        </div>

        {/* 内容区域 */}
        <div className="relative z-10">
          {loading && step === "check" ? (
            <div className="text-center py-12">
              <Loader2 className="w-10 h-10 text-accent mx-auto animate-spin mb-4" />
              <p className="text-muted text-[11px] font-black uppercase tracking-widest">正在深度扫描钱包资产...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <AlertTriangle className="w-12 h-12 text-danger mx-auto mb-4" />
              <p className="text-danger font-bold mb-6">{error}</p>
              <button
                onClick={checkBalances}
                className="flex items-center gap-2 mx-auto px-8 py-4 bg-white/5 hover:bg-white/10 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white transition-all border border-white/10"
              >
                <RefreshCw className="w-4 h-4" />
                重新检查
              </button>
            </div>
          ) : step === "swap" ? (
            <div className="space-y-6">
              <div className="bg-warning/10 border border-warning/20 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-warning font-black text-sm uppercase tracking-tight">资产不足警告</p>
                    <p className="text-muted text-[11px] font-medium mt-1 leading-relaxed">
                      投资此策略需要 <span className="text-white font-bold">{requiredTokens.join(" + ")}</span>，当前缺少 <span className="text-warning font-bold">{missingTokens.join(", ")}</span>。
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] opacity-60">推荐兑换路径</p>
                {missingTokens.map((token) => (
                  <button
                    key={token}
                    onClick={() => openSwapPage(token)}
                    className="w-full flex items-center justify-between p-5 bg-white/5 hover:bg-accent/10 rounded-2xl border border-white/5 hover:border-accent/20 transition-all group active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                        <ArrowLeftRight className="w-5 h-5 text-accent" />
                      </div>
                      <span className="font-black text-white text-sm uppercase tracking-widest">兑换 {token}</span>
                    </div>
                    <ExternalLink className="w-4 h-4 text-muted group-hover:text-accent transition-colors" />
                  </button>
                ))}
              </div>

              <div className="pt-4">
                <button
                  onClick={checkBalances}
                  className="w-full flex items-center justify-center gap-3 py-5 bg-white/5 hover:bg-white/10 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white transition-all border border-white/5"
                >
                  <RefreshCw className="w-4 h-4" />
                  兑换已完成，重试扫描
                </button>
              </div>
            </div>
          ) : step === "ready" ? (
            <div className="space-y-8">
              {/* 余额显示 */}
              <div className="space-y-3">
                <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] opacity-60">可用资产矩阵</p>
                <div className="grid grid-cols-2 gap-4">
                  {requiredTokens.map((token) => {
                    const found = balances.find(
                      (b) => b.symbol === token || b.symbol === `W${token}` || `W${b.symbol}` === token
                    );
                    return (
                      <div key={token} className="bg-black/40 rounded-2xl p-5 border border-white/5 shadow-inner">
                        <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-2">{token}</p>
                        <p className="text-xl font-black text-white tracking-tighter">
                          {found ? found.balance.toFixed(4) : "0"}
                        </p>
                        <p className="text-[10px] text-muted-strong font-bold mt-1">${(found?.usdValue || 0).toFixed(2)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 投资金额输入 */}
              <div className="space-y-3">
                <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] opacity-60">投资分配额度 (USD)</p>
                <div className="relative group">
                  <div className="absolute left-5 top-1/2 -translate-y-1/2 text-accent font-black text-lg">$</div>
                  <input
                    type="number"
                    value={investAmount}
                    onChange={(e) => setInvestAmount(e.target.value)}
                    placeholder="输入投资金额..."
                    className="w-full bg-black/40 border border-white/10 rounded-2xl pl-10 pr-6 py-5 text-white font-black text-xl focus:outline-none focus:border-accent/50 focus:bg-black/60 transition-all shadow-inner"
                  />
                </div>
                <div className="flex justify-between items-center px-1">
                  <p className="text-[10px] text-muted-strong font-bold uppercase tracking-widest">
                    Gas 预留: ${getNativeBalance().toFixed(2)} {CHAIN_NATIVE[pool.chain] || "ETH"}
                  </p>
                  <button 
                    onClick={() => setInvestAmount(Math.floor(getNativeBalance() * 0.9).toString())}
                    className="text-[9px] font-black text-accent uppercase tracking-widest hover:underline"
                  >
                    最大额度
                  </button>
                </div>
              </div>

              {/* 投资按钮 */}
              <button
                onClick={handleInvest}
                disabled={!investAmount || parseFloat(investAmount) <= 0}
                className="w-full flex items-center justify-center gap-3 py-5 bg-accent hover:bg-accent/90 disabled:bg-white/5 disabled:text-muted rounded-2xl text-white text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-accent/20 active:scale-[0.98]"
              >
                <TrendingUp className="w-4 h-4" />
                注入资产矩阵
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : step === "invest" ? (
            <div className="text-center py-12">
              <div className="relative w-20 h-20 mx-auto mb-8">
                <div className="absolute inset-0 border-4 border-accent/20 rounded-full" />
                <div className="absolute inset-0 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                <Rocket className="absolute inset-0 m-auto w-8 h-8 text-accent animate-pulse" />
              </div>
              <p className="text-white font-black text-lg uppercase tracking-tight">正在同步链上合约...</p>
              <p className="text-muted text-[11px] font-bold mt-3 uppercase tracking-widest">请在钱包插件中确认签名请求</p>
            </div>
          ) : step === "success" ? (
            <div className="text-center py-8">
              <div className="w-20 h-20 rounded-3xl bg-success/20 flex items-center justify-center mx-auto mb-6 border border-success/30 shadow-lg shadow-success/10">
                <CheckCircle2 className="w-10 h-10 text-success" />
              </div>
              <p className="text-success font-black text-2xl tracking-tight mb-2">资产注入成功</p>
              <p className="text-muted text-[11px] font-bold mb-10 uppercase tracking-widest opacity-60">交易已提交至共识层，正在等待区块确认</p>
              <button
                onClick={onClose}
                className="w-full py-5 bg-white/5 hover:bg-white/10 rounded-2xl text-white text-[11px] font-black uppercase tracking-widest border border-white/5 transition-all active:scale-[0.98]"
              >
                返回控制台
              </button>
            </div>
          ) : null}
        </div>

        {/* 底部提示 */}
        {!loading && step !== "success" && (
          <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-center gap-2 opacity-40">
            <Shield className="w-3 h-3 text-muted" />
            <p className="text-[9px] font-black text-muted uppercase tracking-[0.2em]">
              Secured by Matrix Risk Engine v2.0
            </p>
          </div>
        )}
      </div>
    </div>
  );

  if (!mounted) return null;

  return createPortal(modalContent, document.body);
}
