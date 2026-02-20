"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Wallet,
  Link2,
  Unlink,
  RefreshCw,
  Copy,
  Check,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  TrendingUp,
  Loader2,
  Scan,
  CircleDollarSign,
  Layers,
  Zap
} from "lucide-react";
import WalletAutomationBridge from "../components/WalletAutomationBridge";
import BatchApprovalManager from "../components/BatchApprovalManager";
import OneClickInvestModal from "../components/OneClickInvestModal";

// ---- 类型 ----
interface WalletState {
  evm: string;
  aptos: string;
  solana: string;
}

interface TokenBalance {
  symbol: string;
  name: string;
  balance: string;
  usdValue: number;
  icon?: string;
}

interface ChainBalance {
  chainId: number;
  chainName: string;
  icon: string;
  tokens: TokenBalance[];
  totalUsd: number;
}

// ---- Window 类型扩展 ----
declare global {
  interface Window {
    okxwallet?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      isOKExWallet?: boolean;
    };
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      isOKExWallet?: boolean;
    };
  }
}

// ---- 链配置 (使用免费公共 RPC) ----
const CHAINS = [
  {
    chainId: 1, name: "Ethereum", symbol: "ETH", icon: "⟠", color: "#6366f1",
    rpc: "https://1rpc.io/eth", // 免费公共 RPC
    tokens: [
      { symbol: "USDT", name: "Tether", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
      { symbol: "USDC", name: "USD Coin", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
      { symbol: "WETH", name: "Wrapped Ether", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
      { symbol: "DAI", name: "Dai", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
      { symbol: "WBTC", name: "Wrapped Bitcoin", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
    ]
  },
  {
    chainId: 56, name: "BNB Chain", symbol: "BNB", icon: "🔶", color: "#F0B90B",
    rpc: "https://1rpc.io/bnb",
    tokens: [
      { symbol: "USDT", name: "Tether", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
      { symbol: "USDC", name: "USD Coin", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
      { symbol: "WBNB", name: "Wrapped BNB", address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", decimals: 18 },
      { symbol: "DAI", name: "Dai", address: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3", decimals: 18 },
      { symbol: "BTCB", name: "Bitcoin BEP20", address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead99", decimals: 18 },
    ]
  },
  {
    chainId: 42161, name: "Arbitrum", symbol: "ETH", icon: "🔵", color: "#28A0F0",
    rpc: "https://1rpc.io/arb",
    tokens: [
      { symbol: "USDT", name: "Tether", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
      { symbol: "USDC", name: "USD Coin", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
      { symbol: "WETH", name: "Wrapped Ether", address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18 },
      { symbol: "ARB", name: "Arbitrum", address: "0x912CE59144191C1204E64559FE8253a0B49E6548", decimals: 18 },
    ]
  },
  {
    chainId: 8453, name: "Base", symbol: "ETH", icon: "🔷", color: "#0052FF",
    rpc: "https://1rpc.io/base",
    tokens: [
      { symbol: "USDC", name: "USD Coin", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
      { symbol: "WETH", name: "Wrapped Ether", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
      { symbol: "DAI", name: "Dai", address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18 },
      { symbol: "WBTC", name: "Wrapped Bitcoin", address: "0x1ceA36D99CC0F6aF824a6A5C5D4b8Dc4522685fC", decimals: 8 },
    ]
  },
  {
    chainId: 10, name: "Optimism", symbol: "ETH", icon: "🔴", color: "#FF0420",
    rpc: "https://1rpc.io/op",
    tokens: [
      { symbol: "USDT", name: "Tether", address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", decimals: 6 },
      { symbol: "USDC", name: "USD Coin", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 },
      { symbol: "WETH", name: "Wrapped Ether", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
      { symbol: "DAI", name: "Dai", address: "0xDA10009cbd5D07dd0CeCc66161FC93d7c9000da1", decimals: 18 },
      { symbol: "WBTC", name: "Wrapped Bitcoin", address: "0x68f180fcCe6836688e9084f035309E29Bf0A2095", decimals: 8 },
    ]
  },
  {
    chainId: 137, name: "Polygon", symbol: "MATIC", icon: "🟣", color: "#8247E5",
    rpc: "https://1rpc.io/matic",
    tokens: [
      { symbol: "USDT", name: "Tether", address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6 },
      { symbol: "USDC", name: "USD Coin", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
      { symbol: "WMATIC", name: "Wrapped Matic", address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18 },
      { symbol: "DAI", name: "Dai", address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", decimals: 18 },
      { symbol: "WBTC", name: "Wrapped Bitcoin", address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", decimals: 8 },
    ]
  },
];

export default function WalletPage() {
  const [wallets, setWallets] = useState<WalletState>({ evm: "", aptos: "", solana: "" });
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [okxDetected, setOkxDetected] = useState(false);
  const [chainBalances, setChainBalances] = useState<ChainBalance[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [positionsValueUsd, setPositionsValueUsd] = useState(0); // 持仓金额
  const [copied, setCopied] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [cacheAge, setCacheAge] = useState<number>(0); // 缓存已过时间（分钟）
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true); // 自动刷新开关
  const [showOneClickInvest, setShowOneClickInvest] = useState(false); // 一键投资模态框
  // 缓存配置：2 分钟自动刷新（减少数据过时）
  const CACHE_TTL_MS = 2 * 60 * 1000;
  const AUTO_REFRESH_INTERVAL = 2 * 60 * 1000;

  // 检测 OKX 钱包
  useEffect(() => {
    const checkOKX = () => {
      const hasOKX = !!(window.okxwallet || window.ethereum?.isOKExWallet);
      setOkxDetected(hasOKX);
      return hasOKX;
    };
    if (!checkOKX()) {
      const interval = setInterval(() => {
        if (checkOKX()) clearInterval(interval);
      }, 500);
      setTimeout(() => clearInterval(interval), 5000);
    }
  }, []);

  // 加载已保存的钱包
  useEffect(() => {
    fetch("/api/wallet")
      .then((r) => r.json())
      .then((data) => {
        if (data.wallets) setWallets(data.wallets);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // 加载持仓金额
  useEffect(() => {
    fetch("/api/positions")
      .then((r) => r.json())
      .then((data) => {
        if (data.totalValue != null) {
          setPositionsValueUsd(data.totalValue);
        }
      })
      .catch(() => {});
  }, []);

  const showMessage = useCallback((type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }, []);

  const copyAddress = () => {
    if (!wallets.evm) return;
    navigator.clipboard.writeText(wallets.evm);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 获取原生代币余额
  const fetchNativeBalance = async (rpcUrl: string, address: string): Promise<number> => {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getBalance", params: [address, "latest"], id: 1 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return Number(BigInt(data.result)) / 1e18;
    } catch (err) {
      console.warn(`[Wallet] Native balance fetch failed for ${rpcUrl}:`, err);
      return 0;
    }
  };

  // 获取 ERC20 代币余额
  const fetchTokenBalance = async (rpcUrl: string, tokenAddress: string, walletAddress: string, decimals: number): Promise<number> => {
    try {
      // 构造 balanceOf(address) 调用数据: 0x70a08231 + 64位地址
      const data = "0x70a08231" + walletAddress.replace("0x", "").padStart(64, "0");
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_call", params: [{ to: tokenAddress, data }, "latest"], id: 1 }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error.message);
      if (result.result && result.result !== "0x") {
        return Number(BigInt(result.result)) / Math.pow(10, decimals);
      }
      return 0;
    } catch (err) {
      console.warn(`[Wallet] Token balance fetch failed for ${tokenAddress} on ${rpcUrl}:`, err);
      return 0;
    }
  };

  // 从缓存加载余额数据
  const loadCachedBalances = useCallback((address: string) => {
    try {
      const cached = localStorage.getItem(`wallet_balances_${address}`);
      if (cached) {
        const { balances, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        if (age < CACHE_TTL_MS && Array.isArray(balances) && balances.length > 0) {
          setChainBalances(balances);
          setLastScanTime(new Date(timestamp));
          console.log("[Wallet] Loaded from cache, age:", Math.round(age / 1000 / 60), "min");
          return true;
        }
      }
    } catch {
      // ignore
    }
    return false;
  }, [CACHE_TTL_MS]);

  // 保存余额到缓存
  const saveBalancesToCache = useCallback((address: string, balances: ChainBalance[]) => {
    try {
      localStorage.setItem(`wallet_balances_${address}`, JSON.stringify({
        balances,
        timestamp: Date.now(),
      }));
    } catch {
      // ignore
    }
  }, []);

  // 获取所有链的余额 (通过后端 API 避免 CORS)
  const fetchAllBalances = useCallback(async (address: string, force = false) => {
    if (!address) return;
    
    // 非强制刷新时，检查缓存
    if (!force && loadCachedBalances(address)) {
      return;
    }
    
    setLoadingBalances(true);
    console.log("[Wallet] Fetching balances via API for", address, force ? "(forced)" : "");
    
    try {
      const res = await fetch(`/api/wallet/balance?address=${address}`);
      const data = await res.json();
      
      if (data.success && data.chainBalances) {
        const balances = data.chainBalances as ChainBalance[];
        setChainBalances(balances);
        setLastScanTime(new Date());
        saveBalancesToCache(address, balances);
        const totalFromChains = balances.reduce((s, c) => s + (c.totalUsd ?? 0), 0);
        console.log("[Wallet] Scan complete. Found assets on", balances.length, "chains, total $", totalFromChains);
        showMessage("success", "余额已更新");
      } else {
        console.warn("[Wallet] API returned no data:", data);
        showMessage("error", "余额查询失败");
      }
    } catch (err) {
      console.error("[Wallet] Balance fetch failed:", err);
      showMessage("error", "余额扫描失败，请稍后重试");
    } finally {
      setLoadingBalances(false);
    }
  }, [showMessage, loadCachedBalances, saveBalancesToCache]);

  // 连接 EVM 钱包
  const connectEVM = async () => {
    setConnecting("evm");
    try {
      const provider = window.okxwallet || window.ethereum;
      if (!provider) throw new Error("未检测到 OKX 钱包");

      const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
      if (!accounts?.length) throw new Error("用户拒绝了连接请求");

      const address = accounts[0];
      const res = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainType: "evm", address, action: "connect" }),
      });

      const data = await res.json();
      if (data.success) {
        setWallets((prev) => ({ ...prev, evm: address }));
        showMessage("success", `EVM 钱包已连接: ${address.slice(0, 6)}...${address.slice(-4)}`);
        // 立即触发余额扫描（强制刷新）
        fetchAllBalances(address, true);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      showMessage("error", `连接失败: ${(err as Error).message}`);
    }
    setConnecting(null);
  };

  // 断开钱包
  const disconnectWallet = async (chainType: string) => {
    try {
      const res = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainType, action: "disconnect" }),
      });
      const data = await res.json();
      if (data.success) {
        setWallets((prev) => ({ ...prev, [chainType]: "" }));
        setChainBalances([]);
        showMessage("success", "钱包已断开连接");
      }
    } catch (err) {
      showMessage("error", `断开失败: ${(err as Error).message}`);
    }
  };

  // 自动加载余额（当钱包地址加载完成后，使用缓存或超过 5 分钟才刷新）
  useEffect(() => {
    if (wallets.evm && !loading) {
      fetchAllBalances(wallets.evm, false); // 不强制刷新，优先使用缓存
    }
  }, [wallets.evm, loading, fetchAllBalances]);

  // 自动刷新定时器
  useEffect(() => {
    if (!wallets.evm || !autoRefreshEnabled) return;
    const interval = setInterval(() => {
      console.log("[Wallet] Auto-refresh triggered");
      fetchAllBalances(wallets.evm, true);
    }, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [wallets.evm, autoRefreshEnabled, fetchAllBalances]);

  // 更新缓存年龄显示
  useEffect(() => {
    if (!lastScanTime) return;
    const updateAge = () => {
      const age = Math.floor((Date.now() - lastScanTime.getTime()) / 60000);
      setCacheAge(age);
    };
    updateAge();
    const interval = setInterval(updateAge, 30000); // 每30秒更新
    return () => clearInterval(interval);
  }, [lastScanTime]);

  if (loading) return <div className="flex items-center justify-center h-96 text-muted animate-pulse font-bold uppercase tracking-widest">正在初始化钱包模块...</div>;

  const isConnected = !!wallets.evm;

  // 钱包余额统一从 chainBalances 计算，确保数据一致性
  const displayedWalletBalance = chainBalances.reduce((s, c) => s + (c.totalUsd ?? 0), 0);
  const displayedTotalAsset = displayedWalletBalance + positionsValueUsd;

  return (
    <div className="relative min-h-screen">
      {/* 一键跨链投资模态框 */}
      {showOneClickInvest && wallets.evm && (
        <OneClickInvestModal
          walletAddress={wallets.evm}
          onClose={() => setShowOneClickInvest(false)}
        />
      )}
      
      <div className="bg-grid opacity-40" />
      
      <div className="space-y-10 pb-20 animate-in fade-in duration-700 stagger-in relative z-10">
        {/* 页面标题 */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-4">
          <div>
            <h2 className="text-4xl font-black text-white tracking-tight font-outfit uppercase">
              金库<span className="text-gradient-accent">中心</span>
            </h2>
            <p className="text-muted-strong text-[11px] font-bold mt-2 flex items-center gap-2 uppercase tracking-[0.2em]">
              <Wallet className="w-4 h-4 text-accent" />
              多链资产管理与钱包连接
            </p>
          </div>
          {isConnected && (
            <div className="flex items-center gap-4">
              {/* 自动刷新开关 */}
              <button
                onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
                className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-[10px] font-black uppercase tracking-widest ${
                  autoRefreshEnabled 
                    ? "bg-success/10 border-success/30 text-success" 
                    : "bg-white/5 border-white/10 text-muted-strong"
                }`}
              >
                <RefreshCw className={`w-3 h-3 ${autoRefreshEnabled ? "animate-spin" : ""}`} style={{ animationDuration: "3s" }} />
                {autoRefreshEnabled ? "自动" : "手动"}
              </button>
              
              {lastScanTime && (
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">上次扫描</span>
                  <span className="text-[10px] text-muted-strong font-mono">
                    {lastScanTime.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    {cacheAge > 0 && <span className="text-white/30 ml-1">({cacheAge}分钟前)</span>}
                  </span>
                </div>
              )}
              <button
                onClick={() => fetchAllBalances(wallets.evm, true)}
                disabled={loadingBalances}
                className="flex items-center gap-3 glass px-6 py-3 rounded-2xl hover:bg-white/5 transition-all active:scale-95 group disabled:opacity-50 border border-white/5 hover:border-accent/30"
              >
                <Scan className={`w-4 h-4 text-muted group-hover:text-accent transition-colors ${loadingBalances ? "animate-pulse" : ""}`} />
                <span className="text-xs font-black text-muted group-hover:text-white uppercase tracking-widest">{loadingBalances ? "扫描中..." : "刷新余额"}</span>
              </button>
              
              {/* 一键跨链投资按钮 */}
              <button
                onClick={() => setShowOneClickInvest(true)}
                className="flex items-center gap-3 bg-accent/20 hover:bg-accent/30 px-6 py-3 rounded-2xl transition-all active:scale-95 group border border-accent/30 hover:border-accent/50"
              >
                <Zap className="w-4 h-4 text-accent" />
                <span className="text-xs font-black text-accent uppercase tracking-widest">一键投资</span>
              </button>
            </div>
          )}
        </div>

        {/* 消息提示 */}
        {message && (
          <div className={`flex items-center gap-4 p-5 rounded-3xl text-sm font-black transition-all shadow-2xl ${
            message.type === "success"
              ? "bg-success/10 border border-success/20 text-success shadow-success/5"
              : "bg-danger/10 border border-danger/20 text-danger shadow-danger/5"
          }`}>
            <div className={`p-2 rounded-xl ${message.type === "success" ? "bg-success/20" : "bg-danger/20"}`}>
              {message.type === "success" ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            </div>
            {message.text}
          </div>
        )}

        {/* OKX 钱包检测 + 连接区 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* 左：插件检测 */}
          <div className={`lg:col-span-4 glass p-10 rounded-[2.5rem] border border-white/5 relative overflow-hidden transition-all duration-700 group/wallet ${okxDetected ? "shadow-2xl shadow-success/5 border-success/10" : "border-warning/10"}`}>
            <div className={`absolute top-0 left-0 w-full h-1.5 transition-all duration-1000 ${okxDetected ? "bg-gradient-to-r from-success via-success/40 to-transparent" : "bg-gradient-to-r from-warning via-warning/40 to-transparent"}`} />
            
            <div className="flex items-center gap-5 mb-10 relative z-10">
              <div className={`w-16 h-16 rounded-[1.25rem] flex items-center justify-center border transition-all duration-700 ${
                okxDetected ? "bg-success/10 border-success/30 shadow-[0_0_25px_rgba(16,185,129,0.2)] group-hover/wallet:scale-110 group-hover/wallet:rotate-3" : "bg-warning/10 border-warning/30"
              }`}>
                <ShieldCheck className={`w-8 h-8 ${okxDetected ? "text-success" : "text-warning"}`} />
              </div>
              <div>
                <h3 className="text-white font-black text-xl font-outfit tracking-tight">OKX Wallet</h3>
                <div className="flex items-center gap-2 mt-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${okxDetected ? "bg-success animate-pulse" : "bg-warning"}`} />
                  <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${okxDetected ? "text-success" : "text-warning"}`}>
                    {okxDetected ? "插件已检测" : "未检测到插件"}
                  </span>
                </div>
              </div>
            </div>

            <div className="relative z-10">
              {!okxDetected && (
                <a
                  href="https://www.okx.com/web3"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl bg-warning/10 border border-warning/20 text-warning text-xs font-black uppercase tracking-widest hover:bg-warning/20 transition-all group"
                >
                  <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" /> 
                  安装 OKX 插件
                </a>
              )}

              {okxDetected && !isConnected && (
                <button
                  onClick={connectEVM}
                  disabled={connecting === "evm"}
                  className="flex items-center justify-center gap-4 w-full py-5 rounded-[1.5rem] bg-accent text-white text-xs font-black uppercase tracking-[0.2em] shadow-2xl shadow-accent/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 relative group/btn"
                >
                  <div className="absolute inset-0 bg-white/20 rounded-[1.5rem] opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                  <span className="relative flex items-center gap-3">
                    {connecting === "evm"
                      ? <><Loader2 className="w-5 h-5 animate-spin" /> 连接中...</>
                      : <><Link2 className="w-5 h-5" /> 连接钱包</>
                    }
                  </span>
                </button>
              )}

              {isConnected && (
                <div className="space-y-6">
                  <div className="p-6 rounded-[1.5rem] bg-[#030406]/60 border border-white/5 group-hover/wallet:border-accent/20 transition-all shadow-inner">
                    <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em] mb-4">钱包地址</p>
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-white font-mono text-sm font-bold tracking-tight bg-white/5 px-3 py-1.5 rounded-lg flex-1 truncate">
                        {wallets.evm}
                      </p>
                      <button onClick={copyAddress} className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-white/5">
                        {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4 text-muted-strong hover:text-white" />}
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => disconnectWallet("evm")}
                    className="flex items-center justify-center gap-3 w-full py-3.5 rounded-2xl bg-danger/5 text-danger/60 text-[10px] font-black uppercase tracking-[0.3em] border border-danger/10 hover:bg-danger/10 hover:text-danger transition-all"
                  >
                    <Unlink className="w-4 h-4" /> 断开连接
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 右：资产总览 */}
          <div className="lg:col-span-8 glass p-10 rounded-[2.5rem] border border-white/5 relative overflow-hidden bg-gradient-to-br from-accent/15 via-accent/5 to-transparent group/stats shadow-2xl transition-all duration-700">
            <div className="absolute top-0 right-0 opacity-10 -mr-16 -mt-16 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
              <CircleDollarSign className="w-80 h-80 text-white" />
            </div>

            <div className="relative z-10 h-full flex flex-col">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12">
                <div className="px-4 py-1.5 rounded-full bg-accent/20 text-accent text-[10px] font-black uppercase tracking-[0.25em] border border-accent/30 w-fit">
                  资产概览
                </div>
                <div className="flex flex-col items-start sm:items-end gap-1">
                  <p className="text-[10px] text-muted-strong font-bold uppercase tracking-widest bg-white/5 px-4 py-1.5 rounded-full border border-white/5">
                    6 条链 · 自动发现代币 · Multicall3
                  </p>
                  <p className="text-[9px] text-white/20 font-bold px-1">
                    * DeFi 协议存款凭证（aToken、LP）在「持仓」页单独显示
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 mb-12">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">总资产</p>
                  <p className="text-5xl font-black text-white tracking-tighter font-outfit">
                    <span className="text-white/30 font-light">$</span>{displayedTotalAsset.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <div className="px-2 py-0.5 rounded bg-accent/10 text-accent text-[9px] font-black uppercase tracking-tighter">实时链上数据</div>
                    <span className="text-[9px] text-muted-strong font-bold uppercase tracking-widest">CoinGecko + OKX 双源报价</span>
                  </div>
                </div>
                
                <div className="space-y-2 pt-2 border-l border-white/5 pl-10">
                  <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">钱包余额</p>
                  <p className="text-3xl font-black text-white/80 font-outfit tracking-tight">
                    ${displayedWalletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[10px] text-muted-strong font-bold uppercase tracking-widest mt-2 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                    可用资金 · 主流代币
                  </p>
                </div>

                <div className="space-y-2 pt-2 border-l border-white/5 pl-10">
                  <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">持仓金额</p>
                  <p className="text-3xl font-black text-accent font-outfit tracking-tight">
                    ${positionsValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[10px] text-muted-strong font-bold uppercase tracking-widest mt-2 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                    策略投资
                  </p>
                </div>
              </div>

              {/* 资产分布条 */}
              <div className="mt-auto">
                <div className="flex justify-between items-end mb-4">
                  <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">资产分布</p>
                  <span className="text-[10px] font-black text-white uppercase tracking-widest">{chainBalances.length} / {CHAINS.length} 条链</span>
                </div>
                
                {displayedTotalAsset > 0 && (
                  <div className="flex h-3 rounded-full overflow-hidden bg-white/5 p-[1px] border border-white/5">
                    <div 
                      className="bg-gradient-to-r from-white/40 to-white/60 transition-all duration-1000 shadow-[0_0_15px_rgba(255,255,255,0.1)]" 
                      style={{ width: `${(displayedWalletBalance / displayedTotalAsset) * 100}%` }}
                    />
                    <div 
                      className="bg-gradient-to-r from-accent to-accent-muted transition-all duration-1000 shadow-[0_0_15px_rgba(14,165,233,0.2)]" 
                      style={{ width: `${(positionsValueUsd / displayedTotalAsset) * 100}%` }}
                    />
                  </div>
                )}
                
                <div className="flex items-center gap-8 mt-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-white/60" />
                    <span className="text-[10px] font-black text-muted-strong uppercase tracking-[0.2em]">流动资产</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_rgba(14,165,233,0.5)]" />
                    <span className="text-[10px] font-black text-muted-strong uppercase tracking-[0.2em]">策略持仓</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 各链余额扫描中 */}
        {loadingBalances && (
          <div className="glass rounded-[2.5rem] p-20 text-center border border-accent/20 bg-accent/5 shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none" />
            <div className="relative z-10">
              <div className="w-24 h-24 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-8 border border-accent/30 shadow-[0_0_50px_rgba(14,165,233,0.2)] animate-pulse">
                <Scan className="w-10 h-10 text-accent" />
              </div>
              <h3 className="text-white font-black text-2xl uppercase tracking-[0.3em] font-outfit mb-4">正在扫描资产</h3>
              <p className="text-muted-strong text-xs font-bold uppercase tracking-[0.2em] mb-10">正在扫描 {CHAINS.length} 条链的原生代币和 ERC20 代币...</p>
              
              <div className="max-w-md mx-auto">
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden p-[0.5px] border border-white/10">
                  <div className="h-full bg-accent w-1/3 animate-[slide_2s_infinite_ease-in-out] rounded-full shadow-[0_0_15px_rgba(14,165,233,0.5)]" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 各链资产明细 */}
        {!loadingBalances && chainBalances.length > 0 && (
          <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <div className="flex items-center gap-4 px-4">
              <Layers className="w-6 h-6 text-accent" />
              <h3 className="text-2xl font-black text-white uppercase tracking-[0.3em]">各链资产</h3>
              <div className="h-[1px] flex-1 bg-gradient-to-r from-white/10 to-transparent ml-4" />
              <span className="text-[10px] font-black text-muted-strong uppercase tracking-[0.2em]">检测到 {chainBalances.reduce((a, c) => a + c.tokens.length, 0)} 种资产</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
              {chainBalances.map((chain) => {
                const chainConf = CHAINS.find(c => c.chainId === chain.chainId);
                const color = chainConf?.color || "#6366f1";

                return (
                  <div key={chain.chainId} className="glass glass-hover rounded-[2.5rem] overflow-hidden border border-white/5 transition-all duration-700 group/chain shadow-xl hover:shadow-2xl">
                    {/* 链头部 */}
                    <div className="p-8 flex items-center justify-between relative overflow-hidden" style={{ borderBottom: `1px solid ${color}22` }}>
                      <div className="absolute inset-0 opacity-0 group-hover/chain:opacity-10 transition-opacity pointer-events-none" style={{ background: `radial-gradient(circle at top right, ${color}, transparent)` }} />
                      
                      <div className="flex items-center gap-5 relative z-10">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center border transition-all duration-700 group-hover/chain:scale-110 group-hover/chain:rotate-3 shadow-2xl overflow-hidden" style={{ backgroundColor: color + "15", borderColor: color + "30" }}>
                          {chain.icon?.startsWith('http') ? (
                            <img src={chain.icon} alt={chain.chainName} className="w-9 h-9 object-contain" />
                          ) : (
                            <span className="text-3xl">{chain.icon}</span>
                          )}
                        </div>
                        <div>
                          <h4 className="text-white font-black text-lg font-outfit uppercase tracking-tight">{chain.chainName}</h4>
                          <p className="text-[9px] font-black text-muted-strong uppercase tracking-widest mt-1">网络 ID: {chain.chainId}</p>
                        </div>
                      </div>
                      <div className="text-right relative z-10">
                        <p className="text-xl font-black text-white font-outfit tracking-tighter">${chain.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-full mt-2 inline-block border" style={{ backgroundColor: color + "10", borderColor: color + "30", color }}>{chain.tokens.length} 种资产</span>
                      </div>
                    </div>

                    {/* 代币列表 */}
                    <div className="p-6 space-y-3">
                      {chain.tokens.map((token, idx) => (
                        <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-transparent hover:border-white/5 transition-all group/token">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 group-hover/token:border-white/20 transition-colors shadow-inner overflow-hidden">
                              {token.icon?.startsWith('http') ? (
                                <img src={token.icon} alt={token.symbol} className="w-6 h-6 object-contain" />
                              ) : token.icon ? (
                                <span className="text-xl">{token.icon}</span>
                              ) : (
                                <CircleDollarSign className="w-5 h-5 text-muted-strong" />
                              )}
                            </div>
                            <div>
                              <p className="text-white font-black text-sm tracking-tight">{token.symbol}</p>
                              <p className="text-[9px] text-muted-strong font-bold uppercase tracking-tighter">{token.name}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-white font-black text-sm font-outfit">{token.balance}</p>
                            <p className="text-[10px] font-bold font-mono tracking-tighter" style={{ color: token.usdValue > 100 ? "#10b981" : "#64748b" }}>
                              ${token.usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 无资产状态 */}
        {!loadingBalances && isConnected && chainBalances.length === 0 && (
          <div className="glass rounded-[2.5rem] p-24 text-center border border-white/5 shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-grid opacity-10 pointer-events-none" />
            <div className="relative z-10 max-w-sm mx-auto">
              <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-8 border border-white/5 shadow-inner group-hover:scale-110 transition-transform duration-700">
                <Scan className="w-10 h-10 text-muted-strong opacity-40" />
              </div>
              <h3 className="text-white font-black text-lg uppercase tracking-[0.3em] mb-3">未检测到资产</h3>
              <p className="text-muted-strong text-xs font-bold uppercase tracking-[0.15em] leading-relaxed">
                索引器未能在已连接的链上找到任何支持的资产。
              </p>
              <button 
                onClick={() => fetchAllBalances(wallets.evm, true)}
                className="mt-10 px-8 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-[0.3em] hover:bg-white/10 transition-all active:scale-95"
              >
                强制扫描
              </button>
            </div>
          </div>
        )}

        {/* 核心功能组件 */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {wallets.evm && (
            <div className="animate-in fade-in slide-in-from-left-4 duration-1000 delay-200">
              <WalletAutomationBridge />
            </div>
          )}
          {wallets.evm && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-1000 delay-400">
              <BatchApprovalManager walletAddress={wallets.evm} />
            </div>
          )}
        </div>

        {/* 安全提示 */}
        <div className="glass rounded-[2.5rem] p-10 border border-warning/10 bg-warning/[0.02] relative overflow-hidden group/warn transition-all duration-700 hover:border-warning/30 shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-warning via-warning/40 to-transparent" />
          <div className="flex flex-col sm:flex-row gap-8 relative z-10">
            <div className="p-4 rounded-2xl bg-warning/10 border border-warning/20 h-fit shadow-lg shadow-warning/5 group-hover/warn:scale-110 group-hover/warn:rotate-6 transition-all duration-700">
              <AlertTriangle className="w-8 h-8 text-warning" />
            </div>
            <div className="flex-1">
              <h3 className="text-warning font-black text-lg uppercase tracking-[0.3em] mb-6">安全提示</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                {[
                  "系统仅读取公开地址，私钥始终离线存储。",
                  "所有链上操作均需 OKX 钱包手动确认。",
                  "隔离建议：使用专用钱包进行策略执行。",
                  "操作风险：大额资产应存储在冷钱包中。"
                ].map((text, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <span className="text-warning font-bold text-lg leading-none opacity-60">0{i+1}</span>
                    <p className="text-[11px] text-warning/70 font-bold uppercase tracking-wider leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes slide {
          from { transform: translateX(-100%); }
          to { transform: translateX(250%); }
        }
      `}</style>
    </div>
  );
}
