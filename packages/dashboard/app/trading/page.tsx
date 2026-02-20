"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  TrendingUp, TrendingDown, Zap, Shield, Clock, DollarSign,
  RefreshCw, AlertTriangle, Check, X, Loader2, Activity,
  ArrowRight, Settings, Lock, ExternalLink, Wallet,
  BarChart3, Database, ChevronDown, ArrowLeftRight,
} from "lucide-react";
import Link from "next/link";

// ---- 类型 ----
interface FundingEntry { platform: string; chain: string; symbol: string; price: number; fundingRateHourly: number; annualized: number; openInterest: number }
interface HLOpportunity { coin: string; fundingRate: number; annualized: number; netAnnualized: number; markPx: number; openInterest: number; viable: boolean }
interface SwapQuote { fromToken: string; toToken: string; fromAmount: string; toAmount: string; toAmountMin: string; estimatedGas: string; priceImpact: number; protocols: string[]; slippage: number }
interface CEXFundingRate { instId: string; rate: number; annualized: number; nextFundingTime: string }

// ---- 工具函数 ----
const fmt = (n: number, d = 2) => n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const pnlColor = (v: number) => v >= 0 ? "text-success" : "text-danger";
const annColor = (v: number) => v >= 50 ? "text-success" : v >= 20 ? "text-warning" : "text-muted";
function fmtCountdown(ms: string, t?: (k: string) => string) {
  const d = parseInt(ms) - Date.now();
  if (d <= 0) return (t && t("settling")) || "Settling";
  const h = Math.floor(d / 3600000), m = Math.floor((d % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}min`;
}

// ---- Platform Badge ----
function PlatformBadge({ platform, chain }: { platform: string; chain: string }) {
  const colors: Record<string, string> = {
    "Hyperliquid": "bg-violet-500/10 text-violet-400 border-violet-500/20",
    "GMX v2":      "bg-blue-500/10 text-blue-400 border-blue-500/20",
    "OKX":         "bg-accent/10 text-accent border-accent/20",
  };
  return (
    <div className="flex flex-col gap-1">
      <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase border ${colors[platform] || "bg-white/5 text-muted border-white/10"}`}>
        {platform}
      </span>
      <span className="text-[8px] text-muted font-bold">{chain}</span>
    </div>
  );
}

// ============================================================
// 主页面
// ============================================================
export default function TradingPage() {
  const t = useTranslations("trading");
  const [tab, setTab] = useState<"overview" | "defi-perp" | "defi-spot" | "cex">("overview");

  // 数据
  const [topRates, setTopRates]     = useState<FundingEntry[]>([]);
  const [hlOpps, setHlOpps]         = useState<HLOpportunity[]>([]);
  const [cexRates, setCexRates]     = useState<CEXFundingRate[]>([]);
  const [walletAddress, setWalletAddress] = useState("");
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);
  const [loading, setLoading]       = useState(false);
  const [countdown, setCountdown]   = useState(30);

  // 套利开仓
  const [arbModal, setArbModal]     = useState<HLOpportunity | null>(null);
  const [arbSize, setArbSize]       = useState("1000");
  const [arbLoading, setArbLoading] = useState(false);
  const [arbResult, setArbResult]   = useState<{ ok: boolean; msg: string } | null>(null);

  // DEX Swap
  const [swapFrom, setSwapFrom]     = useState("USDC");
  const [swapTo, setSwapTo]         = useState("ETH");
  const [swapAmount, setSwapAmount] = useState("100");
  const [swapQuote, setSwapQuote]   = useState<SwapQuote | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapTx, setSwapTx]         = useState<any | null>(null);
  const [swapResult, setSwapResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // GMX 下单
  const [gmxModal, setGmxModal]     = useState<FundingEntry | null>(null);
  const [gmxSize, setGmxSize]       = useState("500");
  const [gmxLong, setGmxLong]       = useState(false); // 套利做空
  const [gmxLoading, setGmxLoading] = useState(false);
  const [gmxResult, setGmxResult]   = useState<{ ok: boolean; msg: string } | null>(null);

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    const [defiRes, cexRes, walletRes] = await Promise.allSettled([
      fetch("/api/trading/defi?action=markets").then(r => r.json()),
      fetch("/api/trading?action=funding-rates").then(r => r.json()),
      fetch("/api/wallet").then(r => r.json()),
    ]);

    if (defiRes.status === "fulfilled" && defiRes.value.success) {
      setTopRates(defiRes.value.topFundingRates || []);
    }
    if (cexRes.status === "fulfilled") {
      setCexRates(cexRes.value.rates || []);
      setApiConfigured(!cexRes.value.needConfig);
    }
    if (walletRes.status === "fulfilled" && walletRes.value.wallets?.evm) {
      setWalletAddress(walletRes.value.wallets.evm);
    }

    // 套利机会
    fetch("/api/trading/defi?action=hl-opps&minAnn=15")
      .then(r => r.json())
      .then(d => d.success && setHlOpps(d.opportunities || []))
      .catch(() => {});

    setLoading(false);
    setCountdown(30);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const t = setInterval(() => setCountdown(c => {
      if (c <= 1) { loadData(); return 30; }
      return c - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [loadData]);

  // DEX 报价
  const fetchSwapQuote = async () => {
    if (!swapFrom || !swapTo || !swapAmount) return;
    setSwapLoading(true); setSwapQuote(null); setSwapTx(null); setSwapResult(null);
    const res = await fetch(`/api/trading/defi?action=swap-quote&chainId=42161&from=${swapFrom}&to=${swapTo}&amount=${swapAmount}`).then(r => r.json());
    if (res.success) setSwapQuote(res.quote);
    setSwapLoading(false);
  };

  // 构建 DEX Swap 交易
  const buildSwapTxHandler = async () => {
    if (!walletAddress) return;
    setSwapLoading(true);
    const res = await fetch("/api/trading/defi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "build-swap", chainId: 42161, fromToken: swapFrom, toToken: swapTo, amount: swapAmount, walletAddress }),
    }).then(r => r.json());
    if (res.success) setSwapTx(res.transaction);
    setSwapLoading(false);
  };

  // 用 OKX 钱包签名并发送 swap tx
  const executeSwap = async () => {
    if (!swapTx) return;
    setSwapLoading(true);
    try {
      const okx = (window as any).okxwallet || (window as any).ethereum;
      if (!okx) throw new Error(t("noOkxWallet"));
      const hash = await okx.request({ method: "eth_sendTransaction", params: [swapTx.tx] });
      setSwapResult({ ok: true, msg: `${t("txSubmitted")} ${String(hash).slice(0, 14)}...` });
    } catch (e: any) {
      setSwapResult({ ok: false, msg: e.message });
    }
    setSwapLoading(false);
  };

  // 开 Hyperliquid 套利仓
  const openHLArb = async () => {
    if (!arbModal || !walletAddress) return;
    setArbLoading(true); setArbResult(null);

    // 构建 HL 做空单
    const res = await fetch("/api/trading/defi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "build-hl-order", walletAddress, coin: arbModal.coin, isBuy: false, sz: parseFloat(arbSize) / arbModal.markPx, isMarket: true }),
    }).then(r => r.json());

    if (!res.success) { setArbResult({ ok: false, msg: res.error }); setArbLoading(false); return; }

    // 用 OKX 钱包 EIP-712 签名
    try {
      const okx = (window as any).okxwallet || (window as any).ethereum;
      if (!okx) throw new Error(t("noOkxWallet"));

      const sig = await okx.request({
        method: "eth_signTypedData_v4",
        params: [walletAddress, JSON.stringify(res.payload.signatureTarget)],
      });

      const r = sig.slice(0, 66);
      const s = "0x" + sig.slice(66, 130);
      const v = parseInt(sig.slice(130, 132), 16);

      const submitRes = await fetch("/api/trading/defi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit-hl-order", hlAction: res.payload.action, nonce: res.payload.nonce, signature: { r, s, v } }),
      }).then(r => r.json());

      if (submitRes.success) {
        setArbResult({ ok: true, msg: t("hlArbSuccess", { coin: arbModal.coin }) });
      } else {
        setArbResult({ ok: false, msg: submitRes.error || t("submitFail") });
      }
    } catch (e: any) {
      setArbResult({ ok: false, msg: e.message });
    }
    setArbLoading(false);
  };

  // 开 GMX 套利仓
  const openGMXArb = async () => {
    if (!gmxModal || !walletAddress) return;
    setGmxLoading(true); setGmxResult(null);

    const res = await fetch("/api/trading/defi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "build-gmx-order", walletAddress, symbol: gmxModal.symbol, isLong: gmxLong, sizeUsd: parseFloat(gmxSize), leverage: 1 }),
    }).then(r => r.json());

    if (!res.success) { setGmxResult({ ok: false, msg: res.error }); setGmxLoading(false); return; }

    // 逐步通过 OKX 钱包签名
    try {
      const okx = (window as any).okxwallet || (window as any).ethereum;
      if (!okx) throw new Error(t("noOkxWallet"));
      for (const step of res.transactions) {
        await okx.request({ method: "eth_sendTransaction", params: [step.tx] });
      }
      setGmxResult({ ok: true, msg: t("gmxSent", { side: gmxLong ? t("long") : t("shortArb") }) });
    } catch (e: any) {
      setGmxResult({ ok: false, msg: e.message });
    }
    setGmxLoading(false);
  };

  const viableOpps = hlOpps.filter(o => o.viable);
  const bestAnn = topRates[0]?.annualized || 0;

  return (
    <div className="space-y-8 pb-24 animate-in fade-in duration-700">
      <div className="bg-grid opacity-40" />

      {/* 头部 */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10">
        <div>
          <h2 className="text-5xl font-black text-white tracking-tighter font-outfit uppercase">
            {t("title")}<span className="text-gradient-accent">{t("titleAccent")}</span>
          </h2>
          <p className="text-muted text-sm font-medium mt-2 opacity-80 flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5 text-violet-400" /> DeFi: Hyperliquid · GMX v2 · 1inch</span>
            <span className="text-white/10">|</span>
            <span className="flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5 text-accent" /> {t("subtitleCex")}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {walletAddress ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-success/30 bg-success/10 text-[10px] font-black uppercase text-success">
              <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              {t("walletConnected")}
            </div>
          ) : (
            <Link href="/wallet" className="flex items-center gap-2 px-4 py-2 rounded-full border border-warning/30 bg-warning/10 text-[10px] font-black uppercase text-warning hover:bg-warning/20 transition-all">
              <Wallet className="w-3.5 h-3.5" /> {t("connectWallet")}
            </Link>
          )}
          <button onClick={loadData} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 glass rounded-2xl border border-white/10 text-[10px] font-black uppercase text-muted hover:text-white transition-all">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            {countdown}s
          </button>
        </div>
      </div>

      {/* 概览指标 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 relative z-10">
        {[
          { label: t("bestAnn"), value: bestAnn > 0 ? `${fmt(bestAnn, 1)}%` : t("loading"), sub: topRates[0] ? `${topRates[0].symbol} · ${topRates[0].platform}` : "—", icon: Zap, color: "warning" },
          { label: t("arbOpportunities"), value: `${viableOpps.length}`, sub: t("arbNetAnn"), icon: TrendingUp, color: "success" },
          { label: t("hlMarkets"), value: `${hlOpps.length}`, sub: t("hlSub"), icon: Activity, color: "accent" },
          { label: t("cexStatus"), value: apiConfigured === true ? t("connected") : t("notConfigured"), sub: apiConfigured ? "OKX Exchange API" : t("goSettings"), icon: BarChart3, color: apiConfigured ? "success" : "danger" },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="glass-cyber p-7 rounded-[2rem] border border-white/5 group">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-4 ${
              color === "success" ? "bg-success/15 text-success" :
              color === "warning" ? "bg-warning/15 text-warning" :
              color === "accent"  ? "bg-accent/15 text-accent"   :
              "bg-danger/15 text-danger"
            } group-hover:scale-110 transition-transform`}>
              <Icon className="w-4 h-4" />
            </div>
            <p className="text-[9px] font-black text-muted uppercase tracking-[0.2em] mb-2">{label}</p>
            <p className={`text-2xl font-black font-outfit tracking-tighter ${
              color === "success" ? "text-success" : color === "warning" ? "text-warning" : color === "accent" ? "text-accent" : "text-danger"
            }`}>{value}</p>
            <p className="text-[9px] text-muted mt-1.5 font-bold">{sub}</p>
          </div>
        ))}
      </div>

      {/* Tab */}
      <div className="flex gap-2 flex-wrap relative z-10">
        {[
          { id: "overview",   label: t("tabOverview"), icon: Activity },
          { id: "defi-perp",  label: `${t("tabArb")} ${viableOpps.length > 0 ? `(${viableOpps.length})` : ""}`, icon: TrendingUp },
          { id: "defi-spot",  label: t("tabDexSpot"), icon: ArrowLeftRight },
          { id: "cex",        label: t("tabCex"), icon: BarChart3 },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id as any)}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${
              tab === id ? "bg-accent/15 text-accent border border-accent/30" : "glass border border-white/5 text-muted hover:text-white hover:border-white/20"
            }`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* ======== Tab 内容 ======== */}
      <div className="relative z-10">

        {/* 总览：跨平台资金费率排行 */}
        {tab === "overview" && (
          <div className="space-y-6">
            <div className="glass-cyber rounded-[2.5rem] border border-white/5 overflow-hidden">
              <div className="p-8 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-widest font-outfit">{t("fundingRankTitle")}</h3>
                  <p className="text-[10px] text-muted mt-1">{t("fundingRankSub")}</p>
                </div>
                <div className="flex gap-3 text-[9px] font-black text-muted uppercase">
                  <span className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-violet-400" />Hyperliquid</span>
                  <span className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-blue-400" />GMX v2</span>
                  <span className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-accent" />OKX CEX</span>
                </div>
              </div>
              <div className="p-6 space-y-2">
                {loading && !topRates.length ? (
                  <div className="flex items-center justify-center py-12 gap-3 text-muted"><Loader2 className="w-5 h-5 animate-spin" />{t("loadingDot")}</div>
                ) : topRates.map((r, i) => (
                  <div key={`${r.platform}-${r.symbol}-${i}`}
                    className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] border border-transparent hover:border-white/5 transition-all group cursor-default">
                    <div className="w-6 text-center text-[10px] font-black text-muted">{i + 1}</div>
                    <div className="w-24 font-black text-white">{r.symbol}</div>
                    <PlatformBadge platform={r.platform} chain={r.chain} />
                    <div className="flex-1 font-mono font-black text-sm text-success">
                      +{(r.fundingRateHourly * 100).toFixed(4)}% / h
                    </div>
                    <div className={`w-28 text-right font-black text-base font-outfit ${annColor(r.annualized)}`}>
                      {fmt(r.annualized, 1)}%<span className="text-[9px] text-muted font-bold"> /年</span>
                    </div>
                    <div className="w-28 text-right text-[10px] text-muted font-bold">
                      OI: ${r.openInterest >= 1e9 ? `${(r.openInterest / 1e9).toFixed(1)}B` : `${(r.openInterest / 1e6).toFixed(0)}M`}
                    </div>
                    {r.annualized >= 20 && (
                      <button
                        onClick={() => { setArbModal(hlOpps.find(o => o.coin === r.symbol) || null); setTab("defi-perp"); }}
                        className="ml-2 px-3 py-1.5 rounded-xl bg-success/10 text-success text-[9px] font-black uppercase border border-success/20 hover:bg-success/20 transition-all opacity-0 group-hover:opacity-100">
                        套利
                      </button>
                    )}
                  </div>
                ))}
                {/* OKX CEX 费率 */}
                {cexRates.slice(0, 5).map((r, i) => (
                  <div key={r.instId} className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] border border-transparent hover:border-white/5 transition-all">
                    <div className="w-6 text-center text-[10px] font-black text-muted">{topRates.length + i + 1}</div>
                    <div className="w-24 font-black text-white">{r.instId.replace("-USDT-SWAP", "")}</div>
                    <PlatformBadge platform="OKX" chain="CEX" />
                    <div className="flex-1 font-mono font-black text-sm text-success">+{(r.rate * 100).toFixed(4)}% / 8h</div>
                    <div className={`w-28 text-right font-black text-base font-outfit ${annColor(r.annualized)}`}>{fmt(r.annualized, 1)}%<span className="text-[9px] text-muted font-bold"> /年</span></div>
                    <div className="w-28 text-right text-[10px] text-muted font-bold">{fmtCountdown(r.nextFundingTime, t)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 链上套利（Hyperliquid + GMX） */}
        {tab === "defi-perp" && (
          <div className="space-y-6">
            {/* 策略说明 */}
            <div className="glass p-6 rounded-2xl border border-white/5 flex items-start gap-4">
              <Shield className="w-5 h-5 text-accent shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-black text-white mb-2">OKX 钱包链上资金费率套利</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] text-muted">
                  <div className="space-y-1">
                    <p className="font-black text-white text-[10px] uppercase tracking-widest">Hyperliquid 路线（推荐）</p>
                    <p>① 1inch 买入现货 → OKX 钱包签名</p>
                    <p>② Hyperliquid 做空永续 → EIP-712 签名</p>
                    <p>③ 每小时收取资金费率，Delta 中性</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-black text-white text-[10px] uppercase tracking-widest">GMX v2 路线</p>
                    <p>① 1inch 买入现货 → OKX 钱包签名</p>
                    <p>② GMX 做空合约 → OKX 钱包签名</p>
                    <p>③ 收取 GMX 协议资金费，适合大资金</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Hyperliquid 套利机会 */}
            <div>
              <div className="flex items-center gap-3 mb-4 px-1">
                <div className="w-2 h-2 rounded bg-violet-400" />
                <p className="text-[10px] font-black text-white uppercase tracking-widest">Hyperliquid 套利机会</p>
                <span className="text-[9px] text-muted font-bold ml-auto">OI = 未平仓合约总量</span>
              </div>
              <div className="space-y-4">
                {hlOpps.length === 0 ? (
                  <div className="flex items-center gap-3 p-6 text-muted"><Loader2 className="w-4 h-4 animate-spin" />扫描中...</div>
                ) : hlOpps.slice(0, 8).map(o => (
                  <div key={o.coin} className={`glass-cyber rounded-[2rem] p-7 border transition-all ${o.viable ? "border-success/20 bg-success/[0.02]" : "border-white/5"}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-5">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border font-black font-outfit ${
                          o.viable ? "bg-success/15 border-success/30 text-success" : "bg-white/5 border-white/10 text-muted"
                        }`}>{o.coin.slice(0, 3)}</div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg font-black text-white font-outfit">{o.coin}/USDC</span>
                            {o.viable && <span className="px-2 py-0.5 rounded-full bg-success/15 text-success text-[8px] font-black uppercase border border-success/20">可套利</span>}
                          </div>
                          <p className="text-[9px] text-muted font-bold">Hyperliquid L1 · 标记价 ${fmt(o.markPx)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-[9px] text-muted font-bold uppercase">年化（净）</p>
                          <p className={`text-xl font-black font-outfit ${annColor(o.netAnnualized)}`}>{fmt(o.netAnnualized, 1)}%</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] text-muted font-bold uppercase">OI</p>
                          <p className="text-sm font-black text-white">${(o.openInterest / 1e6).toFixed(0)}M</p>
                        </div>
                        {o.viable && (
                          <button onClick={() => setArbModal(o)}
                            className="px-5 py-3 rounded-2xl bg-violet-500/10 border border-violet-500/30 text-violet-400 text-[10px] font-black uppercase tracking-widest hover:bg-violet-500/20 active:scale-95 transition-all">
                            开仓套利
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* GMX v2 机会 */}
            <div>
              <div className="flex items-center gap-3 mb-4 px-1">
                <div className="w-2 h-2 rounded bg-blue-400" />
                <p className="text-[10px] font-black text-white uppercase tracking-widest">GMX v2 链上合约（Arbitrum）</p>
              </div>
              <div className="space-y-4">
                {topRates.filter(r => r.platform === "GMX v2").slice(0, 4).map(r => (
                  <div key={r.symbol} className="glass-cyber rounded-[2rem] p-7 border border-blue-500/10 bg-blue-500/[0.02]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-5">
                        <div className="w-12 h-12 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center font-black text-blue-400 font-outfit">
                          {r.symbol.slice(0, 3)}
                        </div>
                        <div>
                          <p className="text-lg font-black text-white font-outfit mb-1">{r.symbol}/USD</p>
                          <p className="text-[9px] text-muted">GMX v2 · Arbitrum · 价格 ${fmt(r.price)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-[9px] text-muted font-bold uppercase">年化费率</p>
                          <p className="text-xl font-black font-outfit text-blue-400">{fmt(r.annualized, 1)}%</p>
                        </div>
                        <button onClick={() => setGmxModal(r)}
                          className="px-5 py-3 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-black uppercase tracking-widest hover:bg-blue-500/20 active:scale-95 transition-all">
                          构建交易
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* DEX 现货 */}
        {tab === "defi-spot" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="glass-cyber p-8 rounded-[2.5rem] border border-white/5">
              <h3 className="text-sm font-black text-white uppercase tracking-widest font-outfit mb-8 flex items-center gap-3">
                <ArrowLeftRight className="w-5 h-5 text-accent" /> DEX 现货兑换（Arbitrum）
              </h3>
              <div className="space-y-5">
                {/* From */}
                <div>
                  <label className="text-[9px] font-black text-muted uppercase tracking-widest mb-2 block">卖出代币</label>
                  <div className="flex gap-3">
                    <select value={swapFrom} onChange={e => { setSwapFrom(e.target.value); setSwapQuote(null); }}
                      className="flex-1 px-4 py-3.5 glass rounded-2xl border border-white/10 text-white text-sm outline-none focus:border-accent/50 bg-transparent appearance-none">
                      {["USDC", "USDT", "ETH", "WETH", "WBTC", "ARB", "LINK"].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input type="number" value={swapAmount} onChange={e => { setSwapAmount(e.target.value); setSwapQuote(null); }}
                      className="w-36 px-4 py-3.5 glass rounded-2xl border border-white/10 text-white text-sm outline-none focus:border-accent/50"
                      placeholder="金额" />
                  </div>
                </div>

                <div className="flex justify-center">
                  <button onClick={() => { const t = swapFrom; setSwapFrom(swapTo); setSwapTo(t); setSwapQuote(null); }}
                    className="w-10 h-10 rounded-full glass border border-white/10 hover:border-accent/40 flex items-center justify-center hover:rotate-180 transition-all duration-500 group">
                    <ArrowLeftRight className="w-4 h-4 text-muted group-hover:text-accent" />
                  </button>
                </div>

                <div>
                  <label className="text-[9px] font-black text-muted uppercase tracking-widest mb-2 block">买入代币</label>
                  <select value={swapTo} onChange={e => { setSwapTo(e.target.value); setSwapQuote(null); }}
                    className="w-full px-4 py-3.5 glass rounded-2xl border border-white/10 text-white text-sm outline-none focus:border-accent/50 bg-transparent appearance-none">
                    {["ETH", "WETH", "WBTC", "ARB", "LINK", "USDC", "USDT"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {/* 报价结果 */}
                {swapQuote && (
                  <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                    {[
                      { l: "预计收到", v: `${swapQuote.toAmount} ${swapQuote.toToken}`, c: "text-success" },
                      { l: "最少收到", v: `${swapQuote.toAmountMin} ${swapQuote.toToken}`, c: "text-muted" },
                      { l: "价格影响", v: `${swapQuote.priceImpact}%`, c: swapQuote.priceImpact > 1 ? "text-danger" : "text-muted" },
                      { l: "路由", v: swapQuote.protocols.join(" → "), c: "text-muted" },
                      { l: "滑点保护", v: `${swapQuote.slippage}%`, c: "text-muted" },
                    ].map(({ l, v, c }) => (
                      <div key={l} className="flex justify-between text-sm">
                        <span className="text-muted font-bold">{l}</span>
                        <span className={`font-black ${c}`}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}

                {swapResult && (
                  <div className={`flex items-center gap-3 p-4 rounded-2xl text-sm font-bold border ${
                    swapResult.ok ? "bg-success/5 border-success/20 text-success" : "bg-danger/5 border-danger/20 text-danger"
                  }`}>
                    {swapResult.ok ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    {swapResult.msg}
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={fetchSwapQuote} disabled={swapLoading}
                    className="flex-1 py-3.5 rounded-2xl glass border border-white/10 hover:border-accent/30 text-white text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
                    {swapLoading && !swapTx ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    获取报价
                  </button>
                  {swapQuote && !swapTx && (
                    <button onClick={buildSwapTxHandler} disabled={swapLoading || !walletAddress}
                      className="flex-1 py-3.5 rounded-2xl bg-accent/10 border border-accent/20 text-accent text-[10px] font-black uppercase tracking-widest hover:bg-accent/20 transition-all active:scale-95 disabled:opacity-50">
                      构建交易
                    </button>
                  )}
                  {swapTx && (
                    <button onClick={executeSwap} disabled={swapLoading}
                      className="flex-1 py-3.5 rounded-2xl bg-accent text-white text-[10px] font-black uppercase tracking-widest hover:bg-accent/90 transition-all active:scale-95 shadow-lg shadow-accent/20 flex items-center justify-center gap-2">
                      {swapLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      OKX 钱包签名
                    </button>
                  )}
                </div>
                {!walletAddress && <p className="text-[9px] text-center text-warning font-bold">请先连接 OKX 插件钱包</p>}
              </div>
            </div>

            {/* 说明 */}
            <div className="space-y-5">
              <div className="glass p-8 rounded-[2.5rem] border border-white/5">
                <p className="text-[10px] font-black text-white uppercase tracking-widest mb-5">DEX 现货流程</p>
                {[
                  { step: "01", title: "选择代币对", desc: "选择来源和目标代币，输入金额" },
                  { step: "02", title: "获取最优报价", desc: "1inch 聚合 Uniswap、Camelot 等多个 DEX 最优路径" },
                  { step: "03", title: "OKX 钱包签名", desc: "系统构建交易，弹出 OKX 钱包，你确认即可" },
                  { step: "04", title: "链上结算", desc: "几秒内完成，代币直接到你的钱包" },
                ].map(({ step, title, desc }) => (
                  <div key={step} className="flex gap-4 mb-5 last:mb-0">
                    <div className="w-8 h-8 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-[9px] font-black text-accent shrink-0">{step}</div>
                    <div>
                      <p className="text-sm font-black text-white mb-0.5">{title}</p>
                      <p className="text-[10px] text-muted">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="glass p-6 rounded-2xl border border-warning/10 bg-warning/[0.02] flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                <p className="text-[10px] text-warning/80 font-bold">
                  1inch API 免费版有频率限制。生产环境建议在 .env.local 配置 ONEINCH_API_KEY 获取更稳定的报价。
                </p>
              </div>
            </div>
          </div>
        )}

        {/* CEX 合约（OKX Exchange API） */}
        {tab === "cex" && (
          <div className="space-y-6">
            {!apiConfigured ? (
              <div className="glass-cyber p-12 rounded-[2.5rem] border border-warning/20 text-center">
                <Lock className="w-10 h-10 text-muted opacity-20 mx-auto mb-6" />
                <h3 className="text-xl font-black text-white mb-3">需要 OKX 交易所 API Key</h3>
                <p className="text-muted text-sm mb-6 max-w-md mx-auto">
                  CEX 合约交易需要单独的 OKX 交易所账户和 API Key（与 OKX 插件钱包账户完全独立）。
                </p>
                <div className="flex gap-4 justify-center flex-wrap">
                  <Link href="/settings" className="px-6 py-3 rounded-2xl bg-accent/10 border border-accent/20 text-accent text-[10px] font-black uppercase tracking-widest hover:bg-accent/20 transition-all flex items-center gap-2">
                    <Settings className="w-4 h-4" /> 配置 API Key
                  </Link>
                  <a href="https://www.okx.com/account/my-api" target="_blank" rel="noopener noreferrer"
                    className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2">
                    <ExternalLink className="w-4 h-4" /> OKX 创建 API Key
                  </a>
                </div>
                <div className="mt-8 p-5 rounded-2xl bg-white/5 border border-white/5 text-left max-w-sm mx-auto">
                  <p className="text-[9px] font-black text-muted uppercase tracking-widest mb-3">配置步骤</p>
                  {["登录 OKX 交易所 (www.okx.com)", "API 管理 → 创建 API Key", "权限：读取 + 交易（不开提现）", "填入 .env.local 中三个变量"].map((s, i) => (
                    <p key={i} className="text-[10px] text-muted flex gap-2 mb-2"><span className="text-accent font-black">0{i+1}</span>{s}</p>
                  ))}
                </div>
              </div>
            ) : (
              <div className="glass-cyber p-8 rounded-[2.5rem] border border-white/5">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  <p className="text-sm font-black text-white uppercase tracking-widest">OKX Exchange API 已连接</p>
                </div>
                <div className="space-y-4">
                  {cexRates.slice(0, 10).map(r => (
                    <div key={r.instId} className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] border border-transparent hover:border-white/5 transition-all">
                      <div className="w-24 font-black text-white">{r.instId.replace("-USDT-SWAP", "")}</div>
                      <PlatformBadge platform="OKX" chain="CEX" />
                      <div className="flex-1 font-mono font-black text-success">+{(r.rate * 100).toFixed(4)}% / 8h</div>
                      <div className={`font-black font-outfit ${annColor(r.annualized)}`}>{fmt(r.annualized, 1)}% / 年</div>
                      <div className="text-[10px] text-muted font-bold">{fmtCountdown(r.nextFundingTime, t)}</div>
                    </div>
                  ))}
                </div>
                <p className="text-[9px] text-center text-muted mt-6 font-bold uppercase tracking-widest">
                  CEX 合约下单功能在 /trading（旧版）页面，当前页面侧重 DeFi 链上交易
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ====== Hyperliquid 套利弹窗 ====== */}
      {arbModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm">
          <div className="glass-cyber rounded-[2.5rem] border border-violet-500/30 w-full max-w-md p-10 shadow-2xl shadow-violet-500/10 animate-in slide-in-from-bottom-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-black text-white font-outfit">Hyperliquid 套利开仓</h3>
                <p className="text-[10px] text-muted mt-1">买现货（1inch）+ 做空合约（HL），Delta 中性</p>
              </div>
              <button onClick={() => { setArbModal(null); setArbResult(null); }} className="p-2.5 rounded-xl hover:bg-white/10 text-muted"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-5">
              <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3 text-sm">
                {[
                  { l: "标的", v: `${arbModal.coin} / USDC` },
                  { l: "标记价", v: `$${fmt(arbModal.markPx)}` },
                  { l: "当期资金费率", v: `+${(arbModal.fundingRate * 100).toFixed(4)}%/h`, c: "text-success" },
                  { l: "预期年化（净）", v: `${fmt(arbModal.netAnnualized, 1)}%`, c: "text-success" },
                  { l: "OI 规模", v: `$${(arbModal.openInterest / 1e6).toFixed(0)}M` },
                ].map(({ l, v, c }) => (
                  <div key={l} className="flex justify-between"><span className="text-muted">{l}</span><span className={`font-black ${c || "text-white"}`}>{v}</span></div>
                ))}
              </div>

              <div>
                <label className="text-[9px] font-black text-muted uppercase tracking-widest mb-2 block">仓位金额 (USD)</label>
                <input type="number" value={arbSize} onChange={e => setArbSize(e.target.value)}
                  className="w-full px-5 py-4 glass rounded-2xl border border-white/10 text-white text-lg font-black outline-none focus:border-violet-500/50 transition-all" />
                <div className="flex gap-2 mt-2">
                  {["500", "1000", "5000"].map(v => (
                    <button key={v} onClick={() => setArbSize(v)} className="px-3 py-1.5 rounded-xl bg-violet-500/10 text-violet-400 text-[9px] font-black border border-violet-500/20 hover:bg-violet-500/20 transition-all">${v}</button>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-[10px] space-y-2 text-muted">
                <p className="font-black text-white">执行步骤：</p>
                <p>① 1inch 买入 ${arbSize} 的 {arbModal.coin}（OKX 钱包签名）</p>
                <p>② Hyperliquid 做空等量 {arbModal.coin}（EIP-712 签名）</p>
                <p>③ 每小时自动收取资金费率，无价格风险</p>
              </div>

              {arbResult && (
                <div className={`flex items-center gap-3 p-4 rounded-2xl font-bold border ${
                  arbResult.ok ? "bg-success/5 border-success/20 text-success" : "bg-danger/5 border-danger/20 text-danger"
                }`}>
                  {arbResult.ok ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  {arbResult.msg}
                </div>
              )}

              <button onClick={openHLArb} disabled={arbLoading || !walletAddress}
                className="w-full py-4 rounded-2xl bg-violet-500 text-white font-black text-sm uppercase tracking-widest hover:bg-violet-500/90 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-xl shadow-violet-500/20">
                {arbLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                {arbLoading ? "签名中..." : "确认开仓"}
              </button>
              {!walletAddress && <p className="text-center text-[9px] text-warning font-bold">请先连接 OKX 插件钱包</p>}
            </div>
          </div>
        </div>
      )}

      {/* ====== GMX 弹窗 ====== */}
      {gmxModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm">
          <div className="glass-cyber rounded-[2.5rem] border border-blue-500/30 w-full max-w-md p-10 shadow-2xl animate-in slide-in-from-bottom-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-black text-white font-outfit">GMX v2 开仓</h3>
                <p className="text-[10px] text-muted mt-1">链上永续合约，OKX 钱包签名执行</p>
              </div>
              <button onClick={() => { setGmxModal(null); setGmxResult(null); }} className="p-2.5 rounded-xl hover:bg-white/10 text-muted"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-5">
              <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3 text-sm">
                {[
                  { l: "标的", v: `${gmxModal.symbol} / USD` },
                  { l: "当前价格", v: `$${fmt(gmxModal.price)}` },
                  { l: "年化费率", v: `${fmt(gmxModal.annualized, 1)}%` },
                ].map(({ l, v }) => (
                  <div key={l} className="flex justify-between"><span className="text-muted">{l}</span><span className="font-black text-white">{v}</span></div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[["做多", false], ["做空（套利）", true]].map(([label, isShort]) => (
                  <button key={String(isShort)} onClick={() => setGmxLong(!isShort as boolean)}
                    className={`py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                      gmxLong === !isShort
                        ? isShort ? "bg-danger/20 border-danger/40 text-danger" : "bg-success/20 border-success/40 text-success"
                        : "border-white/10 text-muted hover:border-white/20"
                    }`}>{label as string}</button>
                ))}
              </div>

              <div>
                <label className="text-[9px] font-black text-muted uppercase tracking-widest mb-2 block">仓位大小 (USD)</label>
                <input type="number" value={gmxSize} onChange={e => setGmxSize(e.target.value)}
                  className="w-full px-5 py-4 glass rounded-2xl border border-white/10 text-white text-lg font-black outline-none focus:border-blue-500/50 transition-all" />
              </div>

              {gmxResult && (
                <div className={`flex items-center gap-3 p-4 rounded-2xl font-bold border ${
                  gmxResult.ok ? "bg-success/5 border-success/20 text-success" : "bg-danger/5 border-danger/20 text-danger"
                }`}>
                  {gmxResult.ok ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  {gmxResult.msg}
                </div>
              )}

              <button onClick={openGMXArb} disabled={gmxLoading || !walletAddress}
                className="w-full py-4 rounded-2xl bg-blue-500 text-white font-black text-sm uppercase tracking-widest hover:bg-blue-500/90 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-xl shadow-blue-500/20">
                {gmxLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                {gmxLoading ? "签名中..." : "OKX 钱包签名执行"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
