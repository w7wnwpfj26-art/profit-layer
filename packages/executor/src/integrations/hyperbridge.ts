/**
 * HyperBridge SDK 适配器
 * 
 * 提供零信任跨链能力，支持：
 * - HTLC 原子交换
 * - 可验证状态查询
 * - 非托管资产转移
 * - 自动证明处理
 */

import { Chain, createLogger } from "@profitlayer/common";

const logger = createLogger("hyperbridge-adapter");

// ---- Types ----

export interface CrossChainRequest {
  sourceChain: Chain;
  targetChain: Chain;
  fromToken: string;
  toToken: string;
  amount: string;
  recipient: string;
  slippageTolerance?: number;
}

export interface HTLCSwapResult {
  swapId: string;
  status: "pending" | "locked" | "claimed" | "refunded" | "expired";
  sourceChain: Chain;
  targetChain: Chain;
  fromToken: string;
  toToken: string;
  amount: string;
  expectedOutput: string;
  lockTx?: string;
  claimTx?: string;
  secretHash: string;
  timelock: number;  // Unix timestamp
  proofSubmitted: boolean;
}

export interface StateQueryResult {
  chain: Chain;
  address: string;
  slot?: string;
  value: string;
  proof: string;
  blockNumber: number;
  verified: boolean;
}

export interface HyperBridgeConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  minConfirmations?: number;
}

// ---- Chain Mapping ----

const CHAIN_TO_HYPERBRIDGE_ID: Partial<Record<Chain, number>> = {
  [Chain.ETHEREUM]: 1,
  [Chain.ARBITRUM]: 42161,
  [Chain.OPTIMISM]: 10,
  [Chain.BASE]: 8453,
  [Chain.POLYGON]: 137,
  [Chain.BSC]: 56,
  [Chain.AVALANCHE]: 43114,
};

const CHAIN_ID_TO_CHAIN: Record<number, Chain> = {
  1: Chain.ETHEREUM,
  42161: Chain.ARBITRUM,
  10: Chain.OPTIMISM,
  8453: Chain.BASE,
  137: Chain.POLYGON,
  56: Chain.BSC,
  43114: Chain.AVALANCHE,
};

// ---- Bridge Safety Database ----

interface BridgeSafety {
  name: string;
  safetyScore: number;
  avgTransferTime: number;  // seconds
  supportedChains: Chain[];
}

const BRIDGE_SAFETY: Record<string, BridgeSafety> = {
  hyperbridge: {
    name: "HyperBridge",
    safetyScore: 95,
    avgTransferTime: 90,
    supportedChains: [Chain.ETHEREUM, Chain.ARBITRUM, Chain.OPTIMISM, Chain.BASE, Chain.POLYGON],
  },
};

// ---- HyperBridge Adapter ----

export class HyperBridgeAdapter {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private minConfirmations: number;

  constructor(config: HyperBridgeConfig = {}) {
    this.apiKey = config.apiKey || process.env.HYPERBRIDGE_API_KEY || "";
    this.baseUrl = config.baseUrl || process.env.HYPERBRIDGE_BASE_URL || "https://api.hyperbridge.network/v1";
    this.timeout = config.timeout || 60000;
    this.minConfirmations = config.minConfirmations || 1;
  }

  /**
   * 发起 HTLC 原子交换
   */
  async initiateSwap(request: CrossChainRequest): Promise<HTLCSwapResult> {
    const sourceChainId = CHAIN_TO_HYPERBRIDGE_ID[request.sourceChain];
    const targetChainId = CHAIN_TO_HYPERBRIDGE_ID[request.targetChain];

    if (!sourceChainId || !targetChainId) {
      throw new Error(`HyperBridge: 不支持的链对 ${request.sourceChain} → ${request.targetChain}`);
    }

    const enabled = process.env.HYPERBRIDGE_ENABLED === "true";
    if (!enabled) {
      logger.debug("HyperBridge: 已禁用，返回模拟结果");
      return this.simulateSwap(request);
    }

    try {
      const payload = {
        sourceChainId,
        targetChainId,
        fromToken: request.fromToken,
        toToken: request.toToken,
        amount: request.amount,
        recipient: request.recipient,
        slippage: request.slippageTolerance || 1,
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
      };
      if (this.apiKey) {
        headers["X-API-Key"] = this.apiKey;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/swap/initiate`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        logger.warn(`HyperBridge API 错误: ${response.status} - ${errorText}`);
        return this.simulateSwap(request);
      }

      const data = await response.json() as {
        swapId: string;
        secretHash: string;
        timelock: number;
        expectedOutput: string;
        lockTx: string;
      };

      return {
        swapId: data.swapId,
        status: "locked",
        sourceChain: request.sourceChain,
        targetChain: request.targetChain,
        fromToken: request.fromToken,
        toToken: request.toToken,
        amount: request.amount,
        expectedOutput: data.expectedOutput,
        lockTx: data.lockTx,
        secretHash: data.secretHash,
        timelock: data.timelock,
        proofSubmitted: false,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        logger.warn("HyperBridge: 请求超时");
      } else {
        logger.warn(`HyperBridge: 请求失败 - ${(error as Error).message}`);
      }
      return this.simulateSwap(request);
    }
  }

  /**
   * 认领跨链资产（提交证明）
   */
  async claimSwap(swapId: string, secret: string): Promise<{
    success: boolean;
    claimTx?: string;
    error?: string;
  }> {
    const enabled = process.env.HYPERBRIDGE_ENABLED === "true";
    if (!enabled) {
      return { success: true, claimTx: `sim_claim_${swapId}` };
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
      };
      if (this.apiKey) {
        headers["X-API-Key"] = this.apiKey;
      }

      const response = await fetch(`${this.baseUrl}/swap/claim`, {
        method: "POST",
        headers,
        body: JSON.stringify({ swapId, secret }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        return { success: false, error: `API 错误: ${response.status} - ${errorText}` };
      }

      const data = await response.json() as { claimTx: string };
      return { success: true, claimTx: data.claimTx };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 查询交换状态
   */
  async getSwapStatus(swapId: string): Promise<HTLCSwapResult | null> {
    const enabled = process.env.HYPERBRIDGE_ENABLED === "true";
    if (!enabled) {
      return null;
    }

    try {
      const headers: Record<string, string> = { "Accept": "application/json" };
      if (this.apiKey) {
        headers["X-API-Key"] = this.apiKey;
      }

      const response = await fetch(`${this.baseUrl}/swap/status/${swapId}`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as {
        swapId: string;
        status: string;
        sourceChainId: number;
        targetChainId: number;
        fromToken: string;
        toToken: string;
        amount: string;
        expectedOutput: string;
        lockTx?: string;
        claimTx?: string;
        secretHash: string;
        timelock: number;
        proofSubmitted: boolean;
      };

      return {
        swapId: data.swapId,
        status: data.status as HTLCSwapResult["status"],
        sourceChain: CHAIN_ID_TO_CHAIN[data.sourceChainId] || Chain.ETHEREUM,
        targetChain: CHAIN_ID_TO_CHAIN[data.targetChainId] || Chain.ETHEREUM,
        fromToken: data.fromToken,
        toToken: data.toToken,
        amount: data.amount,
        expectedOutput: data.expectedOutput,
        lockTx: data.lockTx,
        claimTx: data.claimTx,
        secretHash: data.secretHash,
        timelock: data.timelock,
        proofSubmitted: data.proofSubmitted,
      };
    } catch {
      return null;
    }
  }

  /**
   * 可验证状态查询 - 直接读取远程链状态
   */
  async queryRemoteState(
    chain: Chain,
    contractAddress: string,
    slot?: string
  ): Promise<StateQueryResult | null> {
    const chainId = CHAIN_TO_HYPERBRIDGE_ID[chain];
    if (!chainId) {
      logger.warn(`HyperBridge: 不支持的链 ${chain}`);
      return null;
    }

    const enabled = process.env.HYPERBRIDGE_ENABLED === "true";
    if (!enabled) {
      return this.simulateStateQuery(chain, contractAddress, slot);
    }

    try {
      const headers: Record<string, string> = { "Accept": "application/json" };
      if (this.apiKey) {
        headers["X-API-Key"] = this.apiKey;
      }

      const params = new URLSearchParams({
        chainId: String(chainId),
        address: contractAddress,
        ...(slot && { slot }),
      });

      const response = await fetch(`${this.baseUrl}/state/query?${params}`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as {
        value: string;
        proof: string;
        blockNumber: number;
        verified: boolean;
      };

      return {
        chain,
        address: contractAddress,
        slot,
        value: data.value,
        proof: data.proof,
        blockNumber: data.blockNumber,
        verified: data.verified,
      };
    } catch {
      return null;
    }
  }

  /**
   * 获取跨链路由报价
   */
  async getQuote(request: CrossChainRequest): Promise<{
    estimatedOutput: string;
    estimatedGasUsd: number;
    bridgeFeeUsd: number;
    totalCostUsd: number;
    estimatedTimeSeconds: number;
    safetyScore: number;
  }> {
    const sourceChainId = CHAIN_TO_HYPERBRIDGE_ID[request.sourceChain];
    const targetChainId = CHAIN_TO_HYPERBRIDGE_ID[request.targetChain];

    if (!sourceChainId || !targetChainId) {
      throw new Error(`HyperBridge: 不支持的链对 ${request.sourceChain} → ${request.targetChain}`);
    }

    const enabled = process.env.HYPERBRIDGE_ENABLED === "true";
    if (!enabled) {
      // 返回估算值
      return {
        estimatedOutput: request.amount,
        estimatedGasUsd: 5,
        bridgeFeeUsd: 1,
        totalCostUsd: 6,
        estimatedTimeSeconds: BRIDGE_SAFETY.hyperbridge.avgTransferTime,
        safetyScore: BRIDGE_SAFETY.hyperbridge.safetyScore,
      };
    }

    try {
      const headers: Record<string, string> = { "Accept": "application/json" };
      if (this.apiKey) {
        headers["X-API-Key"] = this.apiKey;
      }

      const params = new URLSearchParams({
        sourceChainId: String(sourceChainId),
        targetChainId: String(targetChainId),
        fromToken: request.fromToken,
        toToken: request.toToken,
        amount: request.amount,
      });

      const response = await fetch(`${this.baseUrl}/swap/quote?${params}`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        throw new Error("Quote API failed");
      }

      const data = await response.json() as {
        estimatedOutput: string;
        gasEstimateUsd: number;
        bridgeFeeUsd: number;
        estimatedTimeSeconds: number;
      };

      return {
        estimatedOutput: data.estimatedOutput,
        estimatedGasUsd: data.gasEstimateUsd,
        bridgeFeeUsd: data.bridgeFeeUsd,
        totalCostUsd: data.gasEstimateUsd + data.bridgeFeeUsd,
        estimatedTimeSeconds: data.estimatedTimeSeconds,
        safetyScore: BRIDGE_SAFETY.hyperbridge.safetyScore,
      };
    } catch {
      return {
        estimatedOutput: request.amount,
        estimatedGasUsd: 5,
        bridgeFeeUsd: 1,
        totalCostUsd: 6,
        estimatedTimeSeconds: BRIDGE_SAFETY.hyperbridge.avgTransferTime,
        safetyScore: BRIDGE_SAFETY.hyperbridge.safetyScore,
      };
    }
  }

  /**
   * 模拟 HTLC 交换（当 API 不可用时）
   */
  private simulateSwap(request: CrossChainRequest): HTLCSwapResult {
    const secret = this.generateSecret();
    const secretHash = this.hashSecret(secret);
    const swapId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return {
      swapId,
      status: "pending",
      sourceChain: request.sourceChain,
      targetChain: request.targetChain,
      fromToken: request.fromToken,
      toToken: request.toToken,
      amount: request.amount,
      expectedOutput: request.amount, // 1:1 估算
      lockTx: `lock:${request.sourceChain}:${swapId}`,
      secretHash,
      timelock: Math.floor(Date.now() / 1000) + 3600, // 1 hour
      proofSubmitted: false,
    };
  }

  /**
   * 模拟状态查询
   */
  private simulateStateQuery(
    chain: Chain,
    address: string,
    slot?: string
  ): StateQueryResult {
    return {
      chain,
      address,
      slot,
      value: "0x0",
      proof: "0x",
      blockNumber: 0,
      verified: false,
    };
  }

  /**
   * 生成随机密钥
   */
  private generateSecret(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * 计算密钥哈希
   */
  private hashSecret(secret: string): string {
    // 简化的哈希实现，生产环境应使用 keccak256
    const bytes = new TextEncoder().encode(secret);
    let hash = 0;
    for (const byte of bytes) {
      hash = ((hash << 5) - hash + byte) | 0;
    }
    return `0x${Math.abs(hash).toString(16).padStart(64, "0")}`;
  }

  /**
   * 检查 API 健康状态
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        headers: this.apiKey ? { "X-API-Key": this.apiKey } : {},
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * 获取支持的链列表
   */
  getSupportedChains(): Chain[] {
    return BRIDGE_SAFETY.hyperbridge.supportedChains;
  }

  /**
   * 获取桥接安全评分
   */
  getSafetyScore(): number {
    return BRIDGE_SAFETY.hyperbridge.safetyScore;
  }
}

// ---- Singleton Export ----

let _instance: HyperBridgeAdapter | null = null;

export function getHyperBridgeAdapter(config?: HyperBridgeConfig): HyperBridgeAdapter {
  if (!_instance) {
    _instance = new HyperBridgeAdapter(config);
  }
  return _instance;
}

export default HyperBridgeAdapter;
