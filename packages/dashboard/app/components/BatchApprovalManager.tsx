"use client";

import { useState, useEffect } from "react";
import { 
  Shield, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  ChevronDown, 
  ChevronUp,
  Zap,
  AlertTriangle,
  ExternalLink
} from "lucide-react";
import { 
  DEFI_PROTOCOLS, 
  STABLECOINS, 
  CHAIN_NAMES,
  type ProtocolContract,
  type TokenContract 
} from "../lib/defi-contracts";

// 链 ID 到区块浏览器 TX URL 映射
const EXPLORER_MAP: Record<number, string> = {
  1: "https://etherscan.io/tx/",
  56: "https://bscscan.com/tx/",
  42161: "https://arbiscan.io/tx/",
  8453: "https://basescan.org/tx/",
  10: "https://optimistic.etherscan.io/tx/",
  137: "https://polygonscan.com/tx/",
};

// ERC20 Approve ABI
const ERC20_APPROVE_ABI = [
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
];

// 合理授权额度: 100万单位 (避免无限授权风险)
// 1_000_000 * 10^18 = 0xD3C21BCECCEDA1000000
const SAFE_APPROVAL_AMOUNT = "0x00000000000000000000000000000000000000000000D3C21BCECCEDA1000000";

interface ApprovalStatus {
  token: string;
  protocol: string;
  chainId: number;
  status: "pending" | "approving" | "success" | "error";
  txHash?: string;
  error?: string;
}

interface Props {
  walletAddress: string;
}

export default function BatchApprovalManager({ walletAddress }: Props) {
  const [selectedChain, setSelectedChain] = useState<number>(1);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [approvalStatuses, setApprovalStatuses] = useState<ApprovalStatus[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // 获取当前链的协议和代币
  const chainProtocols = DEFI_PROTOCOLS.filter(p => p.chainId === selectedChain);
  const chainTokens = STABLECOINS.filter(t => t.chainId === selectedChain);

  // 计算需要授权的总数
  const totalApprovals = chainTokens.length * chainProtocols.length;

  // 编码 approve 调用数据
  const encodeApproveData = (spender: string): string => {
    // approve(address spender, uint256 amount)
    // 函数选择器: 0x095ea7b3
    const selector = "0x095ea7b3";
    const paddedSpender = spender.slice(2).padStart(64, "0");
    const paddedAmount = SAFE_APPROVAL_AMOUNT.slice(2);
    return selector + paddedSpender + paddedAmount;
  };

  // 切换链
  const switchChain = async (chainId: number) => {
    try {
      const okxwallet = (window as any).okxwallet;
      if (!okxwallet) throw new Error("OKX 钱包未安装");

      await okxwallet.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${chainId.toString(16)}` }]
      });
      return true;
    } catch (err: any) {
      // 如果链不存在，尝试添加
      if (err.code === 4902) {
        console.log("需要添加链:", chainId);
      }
      return false;
    }
  };

  // 执行单个授权
  const executeApproval = async (
    token: TokenContract, 
    protocol: ProtocolContract
  ): Promise<{ success: boolean; txHash?: string; error?: string }> => {
    try {
      const okxwallet = (window as any).okxwallet;
      if (!okxwallet) {
        throw new Error("OKX 钱包未安装");
      }

      // 检查钱包连接状态
      const accounts = await okxwallet.request({ method: "eth_accounts" });
      if (!accounts || accounts.length === 0) {
        throw new Error("钱包未连接，请先连接 OKX 钱包");
      }

      // 检查当前链 ID
      const chainIdHex = await okxwallet.request({ method: "eth_chainId" });
      const currentChainId = parseInt(chainIdHex, 16);
      if (currentChainId !== selectedChain) {
        throw new Error(`请先切换到 ${CHAIN_NAMES[selectedChain]} 网络 (当前: ${currentChainId})`);
      }

      const data = encodeApproveData(protocol.address);
      
      console.log(`[授权] ${token.symbol} -> ${protocol.name}`, {
        from: walletAddress,
        to: token.address,
        spender: protocol.address
      });
      
      // 发送交易请求
      const txHash = await okxwallet.request({
        method: "eth_sendTransaction",
        params: [{
          from: walletAddress,
          to: token.address,
          data,
          value: "0x0"
        }]
      });

      console.log(`[授权成功] ${token.symbol} -> ${protocol.name}:`, txHash);
      return { success: true, txHash };
    } catch (err: any) {
      const errorMsg = err.message || err.toString() || "未知错误";
      console.error(`[授权失败] ${token.symbol} -> ${protocol.name}:`, errorMsg);
      
      // 用户拒绝的情况
      if (err.code === 4001 || errorMsg.includes("reject") || errorMsg.includes("denied")) {
        return { success: false, error: "用户拒绝了交易" };
      }
      
      return { success: false, error: errorMsg };
    }
  };

  // 一键批量授权
  const handleBatchApprove = async () => {
    if (!walletAddress) {
      alert("请先连接钱包");
      return;
    }

    // 检查钱包状态
    const okxwallet = (window as any).okxwallet;
    if (!okxwallet) {
      alert("OKX 钱包未安装，请先安装 OKX 钱包插件");
      return;
    }

    // 检查链
    try {
      const chainIdHex = await okxwallet.request({ method: "eth_chainId" });
      const currentChainId = parseInt(chainIdHex, 16);
      if (currentChainId !== selectedChain) {
        const shouldSwitch = confirm(
          `当前网络不是 ${CHAIN_NAMES[selectedChain]}（当前链 ID: ${currentChainId}）\n\n点击"确定"尝试切换网络`
        );
        if (shouldSwitch) {
          await switchChain(selectedChain);
          // 再次检查
          const newChainIdHex = await okxwallet.request({ method: "eth_chainId" });
          const newChainId = parseInt(newChainIdHex, 16);
          if (newChainId !== selectedChain) {
            alert(`网络切换失败，请手动在 OKX 钱包中切换到 ${CHAIN_NAMES[selectedChain]}`);
            return;
          }
        } else {
          return;
        }
      }
    } catch (err) {
      console.error("检查链失败:", err);
    }

    setIsApproving(true);
    setProgress({ current: 0, total: totalApprovals });

    // 初始化状态
    const initialStatuses: ApprovalStatus[] = [];
    for (const token of chainTokens) {
      for (const protocol of chainProtocols) {
        initialStatuses.push({
          token: token.symbol,
          protocol: protocol.name,
          chainId: selectedChain,
          status: "pending"
        });
      }
    }
    setApprovalStatuses(initialStatuses);

    // 逐个执行授权
    let currentIndex = 0;
    let consecutiveErrors = 0;
    
    for (const token of chainTokens) {
      for (const protocol of chainProtocols) {
        // 更新状态为 approving
        setApprovalStatuses(prev => {
          const updated = [...prev];
          updated[currentIndex] = { ...updated[currentIndex], status: "approving" };
          return updated;
        });

        // 执行授权
        const result = await executeApproval(token, protocol);

        // 更新结果
        setApprovalStatuses(prev => {
          const updated = [...prev];
          updated[currentIndex] = {
            ...updated[currentIndex],
            status: result.success ? "success" : "error",
            txHash: result.txHash,
            error: result.error
          };
          return updated;
        });

        currentIndex++;
        setProgress({ current: currentIndex, total: totalApprovals });

        // 如果失败，检查是否继续
        if (!result.success) {
          consecutiveErrors++;
          
          // 如果用户拒绝，询问是否继续
          if (result.error?.includes("拒绝")) {
            const shouldContinue = confirm(
              `您拒绝了 ${token.symbol} -> ${protocol.name} 的授权\n\n点击"确定"继续其他授权，"取消"停止批量授权`
            );
            if (!shouldContinue) {
              setIsApproving(false);
              return;
            }
            consecutiveErrors = 0;
          }
          
          // 如果连续 3 次失败，停止
          if (consecutiveErrors >= 3) {
            alert(`连续 ${consecutiveErrors} 次授权失败，已停止。\n请检查钱包连接和网络状态。`);
            setIsApproving(false);
            return;
          }
        } else {
          consecutiveErrors = 0;
        }

        // 成功后等待一下再继续下一个
        if (result.success) {
          await new Promise(r => setTimeout(r, 1000));
        } else {
          await new Promise(r => setTimeout(r, 300));
        }
      }
    }

    setIsApproving(false);
    alert(`批量授权完成！\n成功: ${approvalStatuses.filter(s => s.status === 'success').length}\n失败: ${approvalStatuses.filter(s => s.status === 'error').length}`);
  };

  // 统计结果
  const successCount = approvalStatuses.filter(s => s.status === "success").length;
  const errorCount = approvalStatuses.filter(s => s.status === "error").length;

  return (
    <div className="glass rounded-[2rem] p-6 border-white/5">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-accent/20 text-accent">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-widest">
              一键批量授权
            </h3>
            <p className="text-[9px] text-muted font-bold uppercase mt-0.5">
              预授权所有常用 DeFi 协议，后续交易无需重复确认
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
        >
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted" />
          )}
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-4">
          {/* 链选择 */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(CHAIN_NAMES).map(([chainId, name]) => (
              <button
                key={chainId}
                onClick={() => setSelectedChain(Number(chainId))}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${
                  selectedChain === Number(chainId)
                    ? "bg-accent text-white"
                    : "bg-white/5 text-muted hover:bg-white/10"
                }`}
              >
                {name}
              </button>
            ))}
          </div>

          {/* 授权预览 */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-white uppercase">
                {CHAIN_NAMES[selectedChain]} 授权预览
              </span>
              <span className="text-[10px] text-muted">
                {chainTokens.length} 代币 × {chainProtocols.length} 协议 = {totalApprovals} 笔授权
              </span>
            </div>

            {/* 代币列表 */}
            <div className="mb-3">
              <span className="text-[9px] text-muted uppercase font-bold">代币：</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {chainTokens.map(t => (
                  <span key={t.address} className="px-2 py-1 rounded-lg bg-success/10 text-success text-[9px] font-bold">
                    {t.symbol}
                  </span>
                ))}
              </div>
            </div>

            {/* 协议列表 */}
            <div>
              <span className="text-[9px] text-muted uppercase font-bold">协议：</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {chainProtocols.slice(0, 8).map((p, i) => (
                  <span key={i} className="px-2 py-1 rounded-lg bg-accent/10 text-accent text-[9px] font-bold">
                    {p.protocol}
                  </span>
                ))}
                {chainProtocols.length > 8 && (
                  <span className="px-2 py-1 rounded-lg bg-white/5 text-muted text-[9px] font-bold">
                    +{chainProtocols.length - 8} 更多
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 警告提示 */}
          <div className="p-3 rounded-xl bg-warning/10 border border-warning/20 flex gap-3">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <div className="text-[10px] text-warning/80 leading-relaxed">
              <p className="font-bold text-warning mb-1">安全提示</p>
              <p>批量授权会授予协议合约花费您代币的权限。请确保您信任这些协议。授权后，协议可以在无需再次确认的情况下使用您的代币。</p>
            </div>
          </div>

          {/* 进度显示 */}
          {approvalStatuses.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted font-bold uppercase">授权进度</span>
                <span className="text-white font-bold">
                  {progress.current} / {progress.total}
                  {successCount > 0 && <span className="text-success ml-2">✓ {successCount}</span>}
                  {errorCount > 0 && <span className="text-danger ml-2">✗ {errorCount}</span>}
                </span>
              </div>
              
              {/* 进度条 */}
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-accent to-success transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>

              {/* 状态列表 */}
              <div className="max-h-40 overflow-y-auto space-y-1 mt-3">
                {approvalStatuses.map((s, i) => (
                  <div 
                    key={i} 
                    className={`flex items-center justify-between p-2 rounded-lg text-[9px] ${
                      s.status === "success" ? "bg-success/10" :
                      s.status === "error" ? "bg-danger/10" :
                      s.status === "approving" ? "bg-accent/10" : "bg-white/5"
                    }`}
                  >
                    <span className="font-bold text-white">
                      {s.token} → {s.protocol}
                    </span>
                    <div className="flex items-center gap-2">
                      {s.status === "pending" && <span className="text-muted">等待中</span>}
                      {s.status === "approving" && <Loader2 className="w-3 h-3 text-accent animate-spin" />}
                      {s.status === "success" && (
                        <>
                          <CheckCircle className="w-3 h-3 text-success" />
                          {s.txHash && (
                            <a 
                              href={`${EXPLORER_MAP[s.chainId] || "https://etherscan.io/tx/"}${s.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-accent hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </>
                      )}
                      {s.status === "error" && (
                        <span className="text-danger flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          {s.error?.slice(0, 20)}...
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 一键授权按钮 */}
          <button
            onClick={handleBatchApprove}
            disabled={isApproving || !walletAddress || totalApprovals === 0}
            className={`w-full py-4 rounded-2xl text-sm font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
              isApproving 
                ? "bg-white/10 text-muted cursor-not-allowed"
                : "bg-gradient-to-r from-accent to-accent/80 text-white shadow-lg shadow-accent/20 hover:shadow-accent/40"
            }`}
          >
            {isApproving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                正在授权 {progress.current}/{progress.total}...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                一键授权 {CHAIN_NAMES[selectedChain]} 全部 {totalApprovals} 笔
              </>
            )}
          </button>
        </div>
      )}

      {!isExpanded && (
        <div className="text-center">
          <p className="text-[10px] text-muted">
            点击展开，一次性授权所有常用 DeFi 协议，后续交易免确认
          </p>
        </div>
      )}
    </div>
  );
}
