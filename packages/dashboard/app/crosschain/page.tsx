"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeftRight, Zap, Shield, Clock, DollarSign,
  ChevronDown, RefreshCw, AlertTriangle, Check,
  ExternalLink, Loader2, ArrowRight, TrendingDown,
  Link2, Info,
} from "lucide-react";

// ---- 类型 ----
interface ChainMeta { id: number; name: string; symbol: string; icon: string; color: string }
interface TokenMeta  { symbol: string; name: string; decimals: number }
interface RouteStep  { type: string; tool: string; toolLogo?: string; description?: string; fromToken: string; toToken: string; fromChain: string | number; toChain: string | number; estimatedGasUsd: number }
interface Route {
  routeId: string;
  bridgeName: string;
  bridgeLogo?: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  fromAmountUsd: number;
  toAmountUsd: number;
  estimatedGasUsd: number;
  bridgeFeeUsd: number;
  totalCostUsd: number;
  estimatedTimeSeconds: number;
  safetyScore: number;
  safetyTvlB: number;
  steps: RouteStep[];
  tags: string[];
}

// ---- 帮助函数 ----
function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  return `${Math.floor(seconds / 3600)}h`;
}

function safetyColor(score: number): string {
  if (score >= 85) return "text-success";
  if (score >= 70) return "text-warning";
  return "text-danger";
}

function safetyBg(score: number): string {
  if (score >= 85) return "bg-success/10 border-success/20";
  if (score >= 70) return "bg-warning/10 border-warning/20";
  return "bg-danger/10 border-danger/20";
}

// ---- Dropdown 通用组件 ----
function Dropdown<T>({
  label, value, options, onChange, renderOption, renderValue,
}: {
  label: string;
  value: T | null;
  options: T[];
  onChange: (v: T) => void;
  renderOption: (v: T, selected: boolean) => React.ReactNode;
  renderValue: (v: T | null) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <label className="text-[9px] font-black text-muted uppercase tracking-[0.2em] mb-2 block">{label}</label>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 glass rounded-2xl border border-white/10 hover:border-accent/40 transition-all"
      >
        <span>{renderValue(value)}</span>
        <ChevronDown className={`w-4 h-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-2 z-50 glass-cyber rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
            {options.map((opt, i) => (
              <button
                key={i}
                onClick={() => { onChange(opt); setOpen(false); }}
                className="w-full text-left hover:bg-white/5 transition-colors"
              >
                {renderOption(opt, JSON.stringify(opt) === JSON.stringify(value))}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---- 主页面 ----
export default function CrossChainPage() {
  const t = useTranslations("crosschain");
  const [chains, setChains]   = useState<ChainMeta[]>([]);
  const [tokens, setTokens]   = useState<TokenMeta[]>([]);
  const [fromChain, setFromChain] = useState<ChainMeta | null>(null);
  const [toChain, setToChain]     = useState<ChainMeta | null>(null);
  const [token,   setToken]       = useState<TokenMeta | null>(null);
  const [amount, setAmount]       = useState("100");
  const [walletAddress, setWalletAddress] = useState("");
  const [routes, setRoutes]         = useState<Route[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [loading, setLoading]       = useState(false);
  const [executing, setExecuting]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [txSteps, setTxSteps]       = useState<any[] | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepResults, setStepResults] = useState<{ ok: boolean; hash?: string; msg: string }[]>([]);
  const [done, setDone]             = useState(false);

  // 加载元数据 & 钱包
  useEffect(() => {
    fetch("/api/crosschain?action=meta")
      .then(r => r.json())
      .then(d => {
        setChains(d.chains || []);
        setTokens(d.tokens || []);
        if (d.chains?.length) { setFromChain(d.chains[1]); setToChain(d.chains[2]); }
        if (d.tokens?.length) setToken(d.tokens[0]);
      })
      .catch(() => {});

    fetch("/api/wallet").then(r => r.json()).then(d => {
      if (d.wallets?.evm) setWalletAddress(d.wallets.evm);
    }).catch(() => {});
  }, []);

  // 路由查询
  const fetchRoutes = useCallback(async () => {
    if (!fromChain || !toChain || !token || !amount || parseFloat(amount) <= 0) return;
    if (!walletAddress) { setError(t("connectWalletFirst")); return; }
    setLoading(true); setError(null); setRoutes([]); setSelectedRoute(null); setTxSteps(null); setDone(false);

    const params = new URLSearchParams({
      from:   fromChain.name.toLowerCase(),
      to:     toChain.name.toLowerCase(),
      token:  token.symbol,
      amount,
      wallet: walletAddress,
    });

    try {
      const res = await fetch(`/api/crosschain?${params}`);
      const data = await res.json();
      if (data.routes?.length) {
        setRoutes(data.routes);
        setSelectedRoute(data.routes[0]);
        // 如果有 notice,显示提示而不是错误
        if (data.notice) {
          // 不设置错误,路由数据正常显示
          console.info(data.notice);
        }
      } else {
        setError(data.error || t("noRoute"));
      }
    } catch {
      setError(t("queryFailed"));
    } finally {
      setLoading(false);
    }
  }, [fromChain, toChain, token, amount, walletAddress]);

  // 互换链
  const swapChains = () => {
    const tmp = fromChain;
    setFromChain(toChain);
    setToChain(tmp);
    setRoutes([]); setSelectedRoute(null);
  };

  // 执行跨链
  const handleExecute = async () => {
    if (!selectedRoute || !fromChain || !toChain || !token || !walletAddress) return;
    setExecuting(true); setError(null); setStepResults([]); setCurrentStep(0); setDone(false);

    try {
      const res = await fetch("/api/crosschain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromChain: fromChain.name.toLowerCase(),
          toChain:   toChain.name.toLowerCase(),
          token: token.symbol,
          amount,
          walletAddress,
          routeId: selectedRoute.routeId,
        }),
      });
      const data = await res.json();
      if (!data.success || !data.transactions?.length) {
        throw new Error(data.error || t("buildTxFailed"));
      }
      setTxSteps(data.transactions);
    } catch (err: any) {
      setError(err.message);
      setExecuting(false);
    }
  };

  // 逐步签名
  useEffect(() => {
    if (!txSteps || currentStep >= txSteps.length || done) return;

    const step = txSteps[currentStep];
    const sign = async () => {
      try {
        const okx = (window as any).okxwallet || (window as any).ethereum;
        if (!okx) throw new Error(t("noOkxWallet"));

        const chainId = parseInt(step.tx.chainId, 16);
        const hexChain = await okx.request({ method: "eth_chainId" });
        if (parseInt(hexChain, 16) !== chainId) {
          await okx.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: step.tx.chainId }],
          });
        }

        const hash = await okx.request({ method: "eth_sendTransaction", params: [step.tx] }) as string;
        setStepResults(prev => [...prev, { ok: true, hash, msg: t("stepSuccess", { step: step.step }) }]);
        if (currentStep + 1 >= txSteps.length) setDone(true);
        else setCurrentStep(prev => prev + 1);
      } catch (err: any) {
        const rejected = err.code === 4001 || err.message?.includes("reject");
        setStepResults(prev => [...prev, { ok: false, msg: rejected ? t("userCancel") : err.message }]);
        setExecuting(false);
      }
    };
    sign();
  }, [txSteps, currentStep]);

  useEffect(() => {
    if (done) setExecuting(false);
  }, [done]);

  return (
    <div className="space-y-10 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <div className="bg-grid opacity-40" />

      {/* 信息提示 */}
      <div className="glass p-6 rounded-[24px] border border-info/20 bg-info/5 relative z-10">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-info shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-white mb-2">{t("demoTitle")}</p>
            <p className="text-xs text-muted leading-relaxed">
              {t("demoDesc")}
            </p>
          </div>
        </div>
      </div>

      {/* 头部 */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10">
        <div>
          <h2 className="text-5xl font-black text-white tracking-tighter font-outfit uppercase">
            {t("title")}<span className="text-gradient-accent">{t("titleAccent")}</span>
          </h2>
          <p className="text-muted text-base font-medium mt-3 opacity-80 max-w-xl">
            {t("subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-black text-muted uppercase tracking-widest">
          <div className="flex items-center gap-2 px-4 py-2 glass rounded-full border border-white/5">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            {t("liFiEngine")}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-10 relative z-10">
        {/* 左侧：输入面板 */}
        <div className="space-y-8">
          {/* 链 & 代币选择器 */}
          <div className="glass-cyber p-8 rounded-[2.5rem] border border-white/5">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-end">
              {/* 来源链 */}
              <Dropdown
                label={t("fromChain")}
                value={fromChain}
                options={chains.filter(c => c.id !== toChain?.id)}
                onChange={c => { setFromChain(c); setRoutes([]); }}
                renderValue={v => v ? (
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{v.icon}</span>
                    <div className="text-left">
                      <p className="text-sm font-black text-white">{v.name}</p>
                      <p className="text-[9px] text-muted font-bold uppercase">{v.symbol}</p>
                    </div>
                  </div>
                ) : <span className="text-muted text-sm">{t("selectChain")}</span>}
                renderOption={(v, sel) => (
                  <div className={`flex items-center gap-3 px-5 py-4 ${sel ? "bg-accent/10" : ""}`}>
                    <span className="text-xl">{v.icon}</span>
                    <div>
                      <p className={`text-sm font-black ${sel ? "text-accent" : "text-white"}`}>{v.name}</p>
                      <p className="text-[9px] text-muted font-bold uppercase">{v.symbol}</p>
                    </div>
                  </div>
                )}
              />

              {/* 互换按钮 */}
              <button
                onClick={swapChains}
                className="w-12 h-12 mx-auto rounded-full glass border border-white/10 hover:border-accent/40 flex items-center justify-center transition-all hover:rotate-180 duration-500 group"
              >
                <ArrowLeftRight className="w-5 h-5 text-muted group-hover:text-accent transition-colors" />
              </button>

              {/* 目标链 */}
              <Dropdown
                label={t("toChain")}
                value={toChain}
                options={chains.filter(c => c.id !== fromChain?.id)}
                onChange={c => { setToChain(c); setRoutes([]); }}
                renderValue={v => v ? (
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{v.icon}</span>
                    <div className="text-left">
                      <p className="text-sm font-black text-white">{v.name}</p>
                      <p className="text-[9px] text-muted font-bold uppercase">{v.symbol}</p>
                    </div>
                  </div>
                ) : <span className="text-muted text-sm">{t("selectChain")}</span>}
                renderOption={(v, sel) => (
                  <div className={`flex items-center gap-3 px-5 py-4 ${sel ? "bg-accent/10" : ""}`}>
                    <span className="text-xl">{v.icon}</span>
                    <div>
                      <p className={`text-sm font-black ${sel ? "text-accent" : "text-white"}`}>{v.name}</p>
                      <p className="text-[9px] text-muted font-bold uppercase">{v.symbol}</p>
                    </div>
                  </div>
                )}
              />
            </div>

            {/* 代币 & 金额 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <Dropdown
                label={t("token")}
                value={token}
                options={tokens}
                onChange={setToken}
                renderValue={v => v ? (
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center border border-accent/30">
                      <span className="text-[9px] font-black text-accent">{v.symbol[0]}</span>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-black text-white">{v.symbol}</p>
                      <p className="text-[9px] text-muted font-bold">{v.name}</p>
                    </div>
                  </div>
                ) : <span className="text-muted text-sm">{t("selectToken")}</span>}
                renderOption={(v, sel) => (
                  <div className={`flex items-center gap-3 px-5 py-3.5 ${sel ? "bg-accent/10" : ""}`}>
                    <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
                      <span className="text-[8px] font-black text-accent">{v.symbol[0]}</span>
                    </div>
                    <div>
                      <p className={`text-sm font-black ${sel ? "text-accent" : "text-white"}`}>{v.symbol}</p>
                      <p className="text-[9px] text-muted">{v.name}</p>
                    </div>
                  </div>
                )}
              />

              <div>
                <label className="text-[9px] font-black text-muted uppercase tracking-[0.2em] mb-2 block">{t("amount")}</label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={e => { setAmount(e.target.value); setRoutes([]); }}
                    placeholder="0.00"
                    className="w-full px-5 py-4 glass rounded-2xl border border-white/10 focus:border-accent/50 focus:ring-4 focus:ring-accent/10 text-white text-lg font-black outline-none transition-all"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-2">
                    {["100", "500", "1000"].map(v => (
                      <button key={v} onClick={() => { setAmount(v); setRoutes([]); }}
                        className="px-2 py-1 rounded-lg bg-accent/10 text-accent text-[9px] font-black hover:bg-accent/20 transition-all">
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 钱包地址 */}
            <div className="mt-4">
              <label className="text-[9px] font-black text-muted uppercase tracking-[0.2em] mb-2 block">
                {t("walletAddress")}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={walletAddress}
                  onChange={e => setWalletAddress(e.target.value)}
                  placeholder={t("walletPlaceholder")}
                  className="w-full pl-5 pr-28 py-3.5 glass rounded-2xl border border-white/10 text-white text-sm font-mono outline-none focus:border-accent/50 transition-all placeholder-white/20"
                />
                {!walletAddress && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-[9px] text-warning font-black uppercase">
                    <Link2 className="w-3 h-3" /> {t("notConnected")}
                  </div>
                )}
              </div>
            </div>

            {/* 查询按钮 */}
            <button
              onClick={fetchRoutes}
              disabled={loading || !fromChain || !toChain || !token || !amount}
              className="w-full mt-6 py-4 rounded-2xl bg-accent text-white font-black text-sm uppercase tracking-widest hover:bg-accent/90 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 shadow-xl shadow-accent/20"
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> {t("querying")}</>
              ) : (
                <><RefreshCw className="w-5 h-5" /> {t("queryRoute")}</>
              )}
            </button>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="flex items-start gap-3 p-5 rounded-2xl bg-danger/5 border border-danger/20 animate-in slide-in-from-top-2">
              <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
              <p className="text-sm text-danger font-bold">{error}</p>
            </div>
          )}

          {/* 路由列表 */}
          {routes.length > 0 && (
            <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between px-1">
                <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.25em]">
                  {t("routesFound", { count: routes.length })}
                </p>
                <div className="flex items-center gap-4 text-[9px] text-muted font-bold uppercase tracking-widest">
                  <span>{t("costWeight")}</span>
                  <span>{t("speedWeight")}</span>
                  <span>{t("safetyWeight")}</span>
                </div>
              </div>

              {routes.map((route, idx) => {
                const isSelected = selectedRoute?.routeId === route.routeId;
                return (
                  <button
                    key={route.routeId}
                    onClick={() => setSelectedRoute(route)}
                    className={`w-full text-left rounded-[2.5rem] p-8 border transition-all duration-300 group ${
                      isSelected
                        ? "border-accent/40 bg-accent/5 shadow-xl shadow-accent/10"
                        : "border-white/5 glass hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4 mb-6">
                      <div className="flex items-center gap-4">
                        {idx === 0 && (
                          <span className="px-2.5 py-1 rounded-full bg-success/15 text-success text-[9px] font-black uppercase tracking-wider border border-success/20">
                            {t("best")}
                          </span>
                        )}
                        <div className="flex items-center gap-3">
                          {route.bridgeLogo ? (
                            <img src={route.bridgeLogo} alt={route.bridgeName} className="w-8 h-8 rounded-full" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                              <Zap className="w-4 h-4 text-white/40" />
                            </div>
                          )}
                          <div>
                            <p className="text-base font-black text-white uppercase tracking-wide">{route.bridgeName}</p>
                            <p className="text-[9px] text-muted font-bold uppercase">{route.steps.length} {t("steps")}</p>
                          </div>
                        </div>
                      </div>
                      {isSelected && <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center"><Check className="w-3 h-3 text-white" /></div>}
                    </div>

                    {/* 路由指标 */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div>
                        <p className="text-[9px] font-black text-muted uppercase tracking-wider mb-1">{t("receiveAmount")}</p>
                        <p className="text-lg font-black text-white font-outfit">{parseFloat(route.toAmount) / 1e6 > 0.01 ? (parseFloat(route.toAmount) / 1e6).toFixed(4) : amount}</p>
                        <p className="text-[9px] text-success">≈ ${route.toAmountUsd > 0 ? route.toAmountUsd.toFixed(2) : (parseFloat(amount) - route.totalCostUsd).toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-muted uppercase tracking-wider mb-1 flex items-center gap-1"><DollarSign className="w-3 h-3" />{t("totalFee")}</p>
                        <p className="text-lg font-black text-white font-outfit">${route.totalCostUsd.toFixed(2)}</p>
                        <p className="text-[9px] text-muted">Gas + Bridge Fee</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-muted uppercase tracking-wider mb-1 flex items-center gap-1"><Clock className="w-3 h-3" />{t("estTime")}</p>
                        <p className="text-lg font-black text-white font-outfit">{formatTime(route.estimatedTimeSeconds)}</p>
                        <p className="text-[9px] text-muted">{t("completeCrosschain")}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-muted uppercase tracking-wider mb-1 flex items-center gap-1"><Shield className="w-3 h-3" />{t("safetyScore")}</p>
                        <p className={`text-lg font-black font-outfit ${safetyColor(route.safetyScore)}`}>{route.safetyScore}/100</p>
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mt-1">
                          <div className={`h-full rounded-full ${safetyColor(route.safetyScore).replace("text-", "bg-")}`} style={{ width: `${route.safetyScore}%` }} />
                        </div>
                      </div>
                    </div>

                    {/* 步骤流程 */}
                    {isSelected && route.steps.length > 0 && (
                      <div className="mt-6 pt-6 border-t border-white/5 flex items-center gap-2 flex-wrap">
                        {route.steps.map((step, si) => (
                          <div key={si} className="flex items-center gap-2">
                            <span className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider ${
                              step.type === "approve" ? "bg-warning/10 text-warning border border-warning/20" :
                              step.type === "swap"    ? "bg-accent/10 text-accent border border-accent/20" :
                              "bg-success/10 text-success border border-success/20"
                            }`}>
                              {step.type === "approve" ? t("approve") : step.type === "swap" ? t("swap") : t("bridge")}
                              {step.tool ? ` · ${step.tool}` : ""}
                            </span>
                            {si < route.steps.length - 1 && <ArrowRight className="w-3 h-3 text-muted" />}
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* 执行按钮 */}
          {selectedRoute && !done && (
            <div className="glass-cyber p-8 rounded-[2.5rem] border border-white/5">
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 rounded-2xl bg-warning/10 border border-warning/20">
                  <AlertTriangle className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="text-sm font-black text-white">{t("executeTitle")}</p>
                  <p className="text-[10px] text-warning/80 mt-1">{t("executeWarn")}</p>
                </div>
              </div>

              {/* 执行进度 */}
              {txSteps && (
                <div className="space-y-3 mb-6">
                  {txSteps.map((step, idx) => {
                    const result = stepResults[idx];
                    const isCurrent = idx === currentStep && executing;
                    return (
                      <div key={idx} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                        result?.ok ? "border-success/30 bg-success/5" :
                        result && !result.ok ? "border-danger/30 bg-danger/5" :
                        isCurrent ? "border-accent/40 bg-accent/5" :
                        "border-white/5 bg-white/[0.02]"
                      }`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          result?.ok ? "bg-success text-white" :
                          result && !result.ok ? "bg-danger text-white" :
                          isCurrent ? "bg-accent/20 border border-accent/40" :
                          "bg-white/5 border border-white/10"
                        }`}>
                          {result?.ok ? <Check className="w-4 h-4" /> :
                           result && !result.ok ? <AlertTriangle className="w-4 h-4" /> :
                           isCurrent ? <Loader2 className="w-4 h-4 text-accent animate-spin" /> :
                           <span className="text-[10px] font-black text-muted">{idx + 1}</span>}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-black text-white">{step.description}</p>
                          <p className="text-[9px] text-muted font-bold uppercase mt-0.5">
                            {result?.ok ? (result.hash ? `Hash: ${result.hash.slice(0, 14)}...` : t("completed")) :
                             result ? result.msg :
                             isCurrent ? t("waitConfirm") :
                             t("pendingExec")}
                          </p>
                        </div>
                        {result?.ok && result.hash && (
                          <a href={`https://etherscan.io/tx/${result.hash}`} target="_blank" rel="noopener noreferrer"
                            className="p-2 rounded-xl hover:bg-white/10 transition-all text-muted hover:text-white">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                onClick={handleExecute}
                disabled={executing || !walletAddress}
                className="w-full py-4 rounded-2xl bg-accent text-white font-black text-sm uppercase tracking-widest hover:bg-accent/90 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-xl shadow-accent/20"
              >
                {executing ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> {t("signingSteps", { current: currentStep + 1, total: txSteps?.length ?? "?" })}</>
                ) : txSteps ? (
                  <><RefreshCw className="w-5 h-5" /> {t("retry")}</>
                ) : (
                  <><Zap className="w-5 h-5" /> {t("startCrosschain")}</>
                )}
              </button>
            </div>
          )}

          {/* 完成状态 */}
          {done && (
            <div className="glass-cyber p-10 rounded-[2.5rem] border border-success/30 bg-success/5 text-center animate-in slide-in-from-bottom-4">
              <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-6 border border-success/30 shadow-xl shadow-success/20">
                <Check className="w-8 h-8 text-success" />
              </div>
              <h3 className="text-2xl font-black text-white mb-2 font-outfit">{t("submittedTitle")}</h3>
              <p className="text-muted text-sm mb-6">{t("submittedDesc", { time: formatTime(selectedRoute?.estimatedTimeSeconds || 300) })}</p>
              <button onClick={() => { setDone(false); setTxSteps(null); setStepResults([]); setRoutes([]); setSelectedRoute(null); }}
                className="px-8 py-3 rounded-2xl bg-success/10 border border-success/20 text-success text-[10px] font-black uppercase tracking-widest hover:bg-success/20 transition-all">
                {t("newCrosschain")}
              </button>
            </div>
          )}
        </div>

        {/* 右侧：信息面板 */}
        <div className="space-y-6">
          {/* 选中路由详情 */}
          {selectedRoute ? (
            <div className="glass-cyber p-8 rounded-[2.5rem] border border-white/5 space-y-6">
              <h3 className="text-[10px] font-black text-white uppercase tracking-[0.25em] flex items-center gap-2">
                <Info className="w-4 h-4 text-accent" /> {t("routeDetail")}
              </h3>
              <div className="space-y-4">
                {[
                  { label: "Bridge", value: selectedRoute.bridgeName.toUpperCase() },
                  { label: t("from"), value: `${fromChain?.name} · ${token?.symbol}` },
                  { label: t("to"), value: `${toChain?.name} · ${token?.symbol}` },
                  { label: t("send"), value: `${amount} ${token?.symbol}` },
                  { label: t("receiveEst"), value: `${(parseFloat(amount) - selectedRoute.totalCostUsd).toFixed(4)} ${token?.symbol}` },
                  { label: t("gasFee"), value: `$${selectedRoute.estimatedGasUsd.toFixed(2)}` },
                  { label: t("bridgeFee"), value: `$${selectedRoute.bridgeFeeUsd.toFixed(2)}` },
                  { label: t("totalFee"), value: `$${selectedRoute.totalCostUsd.toFixed(2)}`, highlight: true },
                  { label: t("estTime"), value: formatTime(selectedRoute.estimatedTimeSeconds) },
                  { label: t("safetyScore"), value: `${selectedRoute.safetyScore}/100`, color: safetyColor(selectedRoute.safetyScore) },
                ].map(({ label, value, highlight, color }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-muted uppercase tracking-wider">{label}</span>
                    <span className={`text-[11px] font-black ${highlight ? "text-warning" : color || "text-white"}`}>{value}</span>
                  </div>
                ))}
              </div>
              <div className={`p-4 rounded-2xl border text-[10px] font-bold ${safetyBg(selectedRoute.safetyScore)}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Shield className={`w-3.5 h-3.5 ${safetyColor(selectedRoute.safetyScore)}`} />
                  <span className={safetyColor(selectedRoute.safetyScore)}>
                    {selectedRoute.safetyScore >= 85 ? t("safetyHigh") : selectedRoute.safetyScore >= 70 ? t("safetyMid") : t("safetyCaution")}
                  </span>
                </div>
                <p className="text-muted mt-1">TVL: ${selectedRoute.safetyTvlB}B · 已审计 · {selectedRoute.safetyScore >= 85 ? "无历史安全事故" : "存在历史事故"}</p>
              </div>
            </div>
          ) : (
            <div className="glass p-8 rounded-[2.5rem] border border-white/5 flex flex-col items-center justify-center text-center py-12">
              <ArrowLeftRight className="w-10 h-10 text-muted opacity-20 mb-4" />
              <p className="text-[10px] text-muted font-black uppercase tracking-widest">{t("selectHint")}</p>
            </div>
          )}

          {/* Bridge 安全矩阵 */}
          <div className="glass p-8 rounded-[2.5rem] border border-white/5">
            <h3 className="text-[10px] font-black text-white uppercase tracking-[0.25em] flex items-center gap-2 mb-6">
              <Shield className="w-4 h-4 text-accent" /> {t("bridgeSafety")}
            </h3>
            <div className="space-y-3">
              {[
                { name: "Chainlink CCIP", score: 92, tag: "最安全" },
                { name: "Across",         score: 88, tag: "推荐" },
                { name: "Stargate",       score: 85, tag: "高流动性" },
                { name: "LayerZero",      score: 82, tag: "快速" },
                { name: "Hop",            score: 80, tag: "" },
                { name: "cBridge",        score: 75, tag: "" },
              ].map(({ name, score, tag }) => (
                <div key={name} className="flex items-center gap-3 group">
                  <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center border border-white/5 shrink-0">
                    <span className="text-[8px] font-black text-muted">{name[0]}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between mb-1.5">
                      <span className="text-[10px] font-black text-white">{name}</span>
                      <div className="flex items-center gap-2">
                        {tag && <span className="text-[8px] px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20 font-black">{tag}</span>}
                        <span className={`text-[10px] font-black ${safetyColor(score)}`}>{score}</span>
                      </div>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-1000 ${score >= 85 ? "bg-success" : score >= 70 ? "bg-warning" : "bg-danger"}`}
                        style={{ width: `${score}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 风险提示 */}
          <div className="glass p-6 rounded-[2.5rem] border border-warning/10 bg-warning/[0.02]">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-[10px] font-black text-warning uppercase tracking-wider">{t("riskTitle")}</p>
                {[t("risk1"), t("risk2"), t("risk3")].map((text, i) => (
                  <p key={i} className="text-[9px] text-warning/60 leading-relaxed flex gap-2">
                    <span className="font-black opacity-60">0{i + 1}</span>{text}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
