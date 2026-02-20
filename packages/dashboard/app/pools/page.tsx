"use client";

import { useState, useEffect, useCallback } from "react";
import { 
  Search, 
  Filter, 
  Zap, 
  Shield, 
  TrendingUp, 
  ExternalLink,
  Database,
  RefreshCw,
  Clock,
  Rocket
} from "lucide-react";
import { apiFetch } from "../lib/api";
import { PageSkeleton, SkeletonCard } from "../components/Skeleton";
import { FeedbackBar } from "../components/FeedbackBar";
import InvestModal from "../components/InvestModal";

interface Pool {
  poolId: string;
  protocolId: string;
  chain: string;
  symbol: string;
  aprTotal: number;
  aprBase: number;
  aprReward: number;
  tvlUsd: number;
  volume24hUsd: number;
  healthScore: number | null;
  riskLevel: string;
  stablecoin: boolean;
}

const RISK_MAP: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: "稳健", color: "text-success", bg: "bg-success/10" },
  medium: { label: "平衡", color: "text-warning", bg: "bg-warning/10" },
  high: { label: "激进", color: "text-danger", bg: "bg-danger/10" },
};

const CHAIN_ICONS: Record<string, string> = {
  ethereum: "⟠", arbitrum: "🔵", bsc: "🔶", polygon: "🟣", base: "🔷", optimism: "🔴", avalanche: "🔺", solana: "🟢", aptos: "⚪",
};

// 协议 → DApp 官方链接（覆盖主流协议）
const PROTOCOL_URLS: Record<string, string> = {
  "uniswap-v3": "https://app.uniswap.org/pools",
  "uniswap-v2": "https://app.uniswap.org/pools",
  "aave-v3": "https://app.aave.com",
  "aave-v2": "https://app.aave.com",
  "curve-dex": "https://curve.fi",
  "curve": "https://curve.fi",
  "lido": "https://stake.lido.fi",
  "compound-v3": "https://app.compound.finance",
  "compound": "https://app.compound.finance",
  "pancakeswap-amm-v3": "https://pancakeswap.finance/liquidity",
  "pancakeswap": "https://pancakeswap.finance/liquidity",
  "sushiswap": "https://www.sushi.com/pool",
  "balancer-v2": "https://app.balancer.fi",
  "balancer": "https://app.balancer.fi",
  "convex-finance": "https://www.convexfinance.com/stake",
  "yearn-finance": "https://yearn.fi/vaults",
  "stargate": "https://stargate.finance/pool",
  "gmx": "https://app.gmx.io",
  "gmx-v2": "https://app.gmx.io",
  "velodrome-v2": "https://velodrome.finance/liquidity",
  "velodrome": "https://velodrome.finance/liquidity",
  "aerodrome": "https://aerodrome.finance/liquidity",
  "aerodrome-v1": "https://aerodrome.finance/liquidity",
  "thala": "https://app.thala.fi/pools",
  "raydium": "https://raydium.io/liquidity",
  "marinade-finance": "https://marinade.finance",
  "orca": "https://www.orca.so",
  "jupiter": "https://jup.ag",
  "morpho": "https://app.morpho.org",
  "morpho-blue": "https://app.morpho.org",
  "spark": "https://app.spark.fi",
  "pendle": "https://app.pendle.finance",
  "eigenlayer": "https://app.eigenlayer.xyz",
  "maker": "https://app.sky.money",
  "sky": "https://app.sky.money",
  "rocket-pool": "https://rocketpool.net",
  "frax-ether": "https://app.frax.finance/frxeth",
  "instadapp": "https://lite.instadapp.io",
  "trader-joe": "https://traderjoexyz.com/pool",
  "trader-joe-v2.1": "https://traderjoexyz.com/pool",
  "camelot-v3": "https://app.camelot.exchange",
  "camelot": "https://app.camelot.exchange",
  "benqi-lending": "https://app.benqi.fi",
  "benqi-staked-avax": "https://staking.benqi.fi",
  "venus": "https://app.venus.io",
  "radiant-v2": "https://app.radiant.capital",
  "extra-finance": "https://app.extra.finance",
  "kamino-lending": "https://app.kamino.finance",
  "marginfi": "https://app.marginfi.com",
  "dydx": "https://trade.dydx.exchange",
};

// DefiLlama 池子详情链接
function getDefiLlamaUrl(poolId: string): string {
  return `https://defillama.com/yields/pool/${poolId}`;
}

// 生成 DApp 链接
function getDappUrl(protocolId: string): string | null {
  // 精确匹配
  if (PROTOCOL_URLS[protocolId]) return PROTOCOL_URLS[protocolId];
  // 模糊匹配（如 "uniswap-v3-ethereum" → "uniswap-v3"）
  for (const [key, url] of Object.entries(PROTOCOL_URLS)) {
    if (protocolId.startsWith(key)) return url;
  }
  // 兜底：尝试 https://{protocol}.fi 或 DefiLlama 协议页
  return `https://defillama.com/protocol/${protocolId}`;
}

const REFRESH_INTERVAL = 3600_000; // 1小时自动刷新

interface PoolsResponse {
  pools: Pool[];
  total: number;
}

export default function PoolsPage() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [chainFilter, setChainFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"apr" | "tvl" | "health">("apr");
  const [minHealth, setMinHealth] = useState<string>("");
  const [chains, setChains] = useState<string[]>(["all"]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(3600);
  const [mounted, setMounted] = useState(false);
  const [investPool, setInvestPool] = useState<Pool | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  // 客户端挂载后初始化
  useEffect(() => {
    setMounted(true);
    setLastRefresh(new Date());
    
    // 获取钱包地址
    const loadWallet = async () => {
      try {
        const res = await fetch("/api/wallet");
        const data = await res.json();
        if (data.wallets?.evm) setWalletAddress(data.wallets.evm);
      } catch {
        // ignore
      }
    };
    loadWallet();
  }, []);

  const fetchPools = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      sort: sortBy,
      limit: "100",
      minTvl: "100000",
    });
    if (chainFilter !== "all") params.set("chain", chainFilter);
    if (search) params.set("search", search);
    if (minHealth !== "" && !Number.isNaN(parseFloat(minHealth))) params.set("minHealth", minHealth);

    const result = await apiFetch<PoolsResponse>(`/api/pools?${params}`);
    if (result.ok) {
      setPools(result.data.pools || []);
      setTotal(result.data.total || 0);
      setLastRefresh(new Date());

      if (chainFilter === "all" && !search) {
        const c = ["all", ...new Set((result.data.pools || []).map((p: Pool) => p.chain))] as string[];
        setChains(c);
      }
    } else {
      if (!silent) setError(result.error);
    }
    setLoading(false);
  }, [sortBy, chainFilter, search, minHealth]);

  // 首次加载 + 筛选变化时请求
  useEffect(() => {
    const timer = setTimeout(() => fetchPools(), 300);
    return () => clearTimeout(timer);
  }, [fetchPools]);

  // 定时自动刷新（每 60 秒静默刷新，不显示 loading）
  useEffect(() => {
    const interval = setInterval(() => fetchPools(true), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchPools]);

  // 倒计时显示（仅在客户端运行）
  useEffect(() => {
    if (!mounted) return;
    setCountdown(3600);
    const timer = setInterval(() => setCountdown((c) => (c <= 1 ? 3600 : c - 1)), 1000);
    return () => clearInterval(timer);
  }, [lastRefresh, mounted]);

  // 格式化倒计时显示
  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}分${s}秒` : `${s}秒`;
  };

  return (
    <>
      {/* 一键投资模态框 - 移出动画容器以防止 fixed 定位失效 */}
      {investPool && (
        <InvestModal
          pool={investPool}
          onClose={() => setInvestPool(null)}
          walletAddress={walletAddress || undefined}
        />
      )}

      <div className="space-y-10 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        {/* 页面标题 - Premium 增强 */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-accent/20 flex items-center justify-center border border-accent/20">
                <Database className="w-6 h-6 text-accent" />
              </div>
              <h2 className="text-5xl font-black text-white tracking-tighter font-outfit">池子 <span className="text-gradient-accent">资源库</span></h2>
            </div>
            <p className="text-muted text-base font-medium opacity-80 max-w-xl">
              {loading ? "正在深度扫描协议层..." : `聚合全球 ${total} 个顶级协议流动性池。实时监控年化收益、深度及安全评分，一键直达协议交互界面。`}
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            {mounted && (
              <div className="flex items-center gap-3 px-5 py-2.5 glass rounded-[1.2rem] border-white/5">
                <div className="w-2 h-2 rounded-full bg-success animate-pulse shadow-[0_0_10px_#10b981]" />
                <Clock className="w-4 h-4 text-muted" />
                <span className="text-[11px] font-black text-muted uppercase tracking-widest">{formatCountdown(countdown)} 后更新</span>
              </div>
            )}
            <button 
              onClick={() => fetchPools()} 
              disabled={loading}
              className="group flex items-center gap-3 px-6 py-3 glass rounded-[1.2rem] bg-accent/10 hover:bg-accent text-white transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-accent/10"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} />
              <span className="text-[11px] font-black uppercase tracking-widest">立即刷新</span>
            </button>
          </div>
        </div>

        {/* 筛选控制台 - 更加极客的 UI */}
        <div className="glass p-6 rounded-[2.5rem] flex flex-wrap items-center gap-6 border-white/5 shadow-2xl">
          <div className="flex-1 min-w-[350px] relative group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted group-focus-within:text-accent transition-colors" />
            <input
              type="text"
              placeholder="搜索资产、协议 ID 或合约地址 (如: USDC, Uniswap...)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-2xl pl-14 pr-6 py-4 text-sm text-white placeholder:text-muted/50 focus:outline-none focus:border-accent/50 focus:bg-black/40 transition-all shadow-inner"
            />
          </div>

          <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded-2xl border border-white/5">
            <button onClick={() => setSortBy("apr")} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sortBy === "apr" ? "bg-accent text-white shadow-xl scale-105" : "text-muted hover:text-white"}`}>
              最高收益
            </button>
            <button onClick={() => setSortBy("tvl")} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sortBy === "tvl" ? "bg-accent text-white shadow-xl scale-105" : "text-muted hover:text-white"}`}>
              最大深度
            </button>
            <button onClick={() => setSortBy("health")} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sortBy === "health" ? "bg-accent text-white shadow-xl scale-105" : "text-muted hover:text-white"}`}>
              最优安全
            </button>
          </div>

          <div className="flex items-center gap-4">
            <select
              value={chainFilter}
              onChange={(e) => setChainFilter(e.target.value)}
              className="bg-black/20 border border-white/10 rounded-2xl px-6 py-4 text-[11px] font-black text-white uppercase tracking-widest outline-none cursor-pointer hover:bg-black/40 transition-all appearance-none min-w-[140px] text-center"
            >
              {chains.map((c) => (
                <option key={c} value={c} className="bg-[#0a0a0f]">{c === "all" ? "所有区块链" : `${c.toUpperCase()}`}</option>
              ))}
            </select>

            <div className="flex items-center gap-3 bg-black/20 border border-white/10 px-6 py-4 rounded-2xl group">
              <Filter className="w-4 h-4 text-muted group-focus-within:text-accent" />
              <input
                type="number"
                min={0}
                max={100}
                placeholder="最低评分"
                value={minHealth}
                onChange={(e) => setMinHealth(e.target.value)}
                className="bg-transparent w-16 text-[11px] font-black text-white uppercase tracking-widest outline-none border-none placeholder:text-muted/50"
              />
            </div>
          </div>
        </div>

        {/* 错误提示 */}
        <FeedbackBar message={error} variant="error" onDismiss={() => setError(null)} />

        {/* 列表网格 */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : pools.length === 0 ? (
          <div className="glass rounded-[2.5rem] p-16 text-center border-white/5">
            <Search className="w-12 h-12 text-muted/20 mx-auto mb-4" />
            <p className="text-muted font-bold uppercase tracking-[0.2em] text-xs">未找到符合条件的池子</p>
            <p className="text-muted/60 text-[10px] mt-2">尝试调整筛选条件或降低最低健康分</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {pools.map((pool) => (
              <PoolCard key={pool.poolId} pool={pool} onInvest={() => setInvestPool(pool)} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function PoolCard({ pool, onInvest }: { pool: Pool; onInvest?: () => void }) {
  const risk = RISK_MAP[pool.riskLevel] || RISK_MAP.medium;
  const dappUrl = getDappUrl(pool.protocolId);
  const llamaUrl = getDefiLlamaUrl(pool.poolId);

  return (
    <div className="glass-hover glass rounded-[2.5rem] p-8 relative group flex flex-col h-full transition-all duration-700 overflow-hidden border-white/5 hover:border-accent/20 hover:shadow-[0_40px_100px_rgba(99,102,241,0.1)] stagger-in">
      {/* 背景光晕装饰 */}
      <div className={`absolute -top-24 -right-24 w-64 h-64 blur-[100px] opacity-10 rounded-full transition-all duration-1000 group-hover:opacity-30 group-hover:scale-125 ${(pool.healthScore ?? 0) >= 70 ? 'bg-success' : 'bg-accent'}`} />
      
      {/* 卡片头部 */}
      <div className="flex justify-between items-start mb-8 relative z-10">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-[1.5rem] bg-black/40 flex items-center justify-center border border-white/10 group-hover:border-accent/40 transition-all group-hover:scale-110 shadow-xl">
            <span className="text-3xl filter drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">{CHAIN_ICONS[pool.chain] || "🌐"}</span>
          </div>
          <div>
            <h3 className="text-2xl font-black text-white group-hover:text-accent transition-colors tracking-tighter">{pool.symbol}</h3>
            <div className="flex items-center gap-3 mt-1.5">
              <a 
                href={dappUrl || "#"} 
                target="_blank" 
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[11px] font-black text-accent uppercase tracking-[0.15em] hover:brightness-125 transition-all flex items-center gap-1"
              >
                {pool.protocolId}
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
              <div className="w-1 h-1 rounded-full bg-white/20" />
              <span className="text-[11px] font-black text-muted uppercase tracking-[0.15em]">{pool.chain}</span>
            </div>
          </div>
        </div>
        <div className={`px-4 py-1.5 rounded-xl ${risk.bg} ${risk.color} text-[10px] font-black uppercase tracking-[0.2em] border border-current/10 shadow-sm`}>
          {risk.label}风险
        </div>
      </div>

      {/* 核心指标区域 - Premium 卡片质感 */}
      <div className="bg-white/5 rounded-[2rem] p-6 mb-8 border border-white/5 group-hover:bg-white/10 transition-all relative z-10 shadow-inner">
        <div className="flex justify-between items-end">
          <div className="space-y-1">
            <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] opacity-60">预期年化收益 (APY)</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-success tracking-tighter drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]">{pool.aprTotal.toFixed(2)}%</span>
              <div className="w-6 h-6 rounded-full bg-success/10 flex items-center justify-center group-hover:animate-bounce">
                <TrendingUp className="w-3.5 h-3.5 text-success" />
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] mb-1 opacity-60">安全评分</p>
            <span className={`text-2xl font-black tracking-tighter ${(pool.healthScore ?? 0) >= 70 ? 'text-success' : (pool.healthScore ?? 0) >= 50 ? 'text-warning' : 'text-danger'}`}>
              {pool.healthScore?.toFixed(0) || "N/A"}
            </span>
          </div>
        </div>
        
        {/* 健康度进度条 - 极光动效 */}
        <div className="mt-5 h-2 w-full bg-black/40 rounded-full overflow-hidden border border-white/5">
          <div 
            className={`h-full rounded-full transition-all duration-[1.5s] ease-out relative ${(pool.healthScore ?? 0) >= 70 ? 'bg-success' : (pool.healthScore ?? 0) >= 50 ? 'bg-warning' : 'bg-danger'}`}
            style={{ width: `${pool.healthScore || 0}%` }}
          >
             <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-full animate-shimmer" />
          </div>
        </div>
      </div>

      {/* 底部统计 */}
      <div className="grid grid-cols-2 gap-8 mt-auto relative z-10">
        <div className="space-y-1.5">
          <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] opacity-60">总锁仓量 (TVL)</p>
          <p className="text-lg font-black text-white tracking-tight">
            ${pool.tvlUsd >= 1e9 ? `${(pool.tvlUsd / 1e9).toFixed(2)}B` : pool.tvlUsd >= 1e6 ? `${(pool.tvlUsd / 1e6).toFixed(1)}M` : `${(pool.tvlUsd / 1e3).toFixed(0)}K`}
          </p>
        </div>
        <div className="space-y-1.5 text-right">
          <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] opacity-60">24H 交易额</p>
          <p className="text-lg font-black text-white tracking-tight">
            {pool.volume24hUsd > 0 ? `$${pool.volume24hUsd >= 1e6 ? `${(pool.volume24hUsd / 1e6).toFixed(1)}M` : `${(pool.volume24hUsd / 1e3).toFixed(0)}K`}` : "---"}
          </p>
        </div>
      </div>

      {/* 底部工具栏 */}
      <div className="mt-8 flex items-center justify-between pt-6 border-t border-white/5 relative z-10">
        <div className="flex gap-2">
          {pool.stablecoin && (
            <span className="flex items-center gap-1.5 text-[9px] font-black text-accent px-3 py-1.5 rounded-xl bg-accent/10 border border-accent/20 uppercase tracking-widest shadow-lg shadow-accent/5">
              <Shield className="w-3 h-3" /> 稳定币
            </span>
          )}
          <span className="flex items-center gap-1.5 text-[9px] font-black text-warning px-3 py-1.5 rounded-xl bg-warning/10 border border-warning/20 uppercase tracking-widest shadow-lg shadow-warning/5">
            <Zap className="w-3 h-3" /> 自动复投
          </span>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={llamaUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="查看 DefiLlama 链上数据"
            className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 text-muted hover:text-white flex items-center justify-center transition-all border border-white/5 hover:scale-110"
          >
            📊
          </a>
          {onInvest && (
            <button
              onClick={(e) => { e.stopPropagation(); onInvest(); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-success/20 hover:bg-success text-success hover:text-white transition-all text-[11px] font-black uppercase tracking-widest border border-success/30 hover:border-success shadow-lg shadow-success/10 hover:scale-105 active:scale-95"
            >
              <Rocket className="w-3.5 h-3.5" /> 投资
            </button>
          )}
          {dappUrl && (
            <a
              href={dappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent/20 hover:bg-accent text-accent hover:text-white transition-all text-[11px] font-black uppercase tracking-widest border border-accent/30 hover:border-accent shadow-lg shadow-accent/10 hover:scale-105 active:scale-95"
            >
              交互 <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
