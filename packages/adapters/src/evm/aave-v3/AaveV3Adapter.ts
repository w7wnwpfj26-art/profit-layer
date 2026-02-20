// ============================================
// Aave V3 Lending Protocol Adapter
// ============================================

import {
  Chain,
  ProtocolCategory,
  createLogger,
  type Pool,
  type APRBreakdown,
  type Position,
  type TransactionPayload,
  type DepositParams,
  type WithdrawParams,
  type HarvestParams,
  type CompoundParams,
} from "@profitlayer/common";
import { createPublicClient, http, encodeFunctionData, type Chain as ViemChain } from "viem";
import { mainnet, arbitrum, polygon, optimism, base, avalanche } from "viem/chains";
import type { ILendingAdapter, LendingMarket, BorrowPosition } from "../../base/ILendingAdapter.js";

const logger = createLogger("adapters:aave-v3");

// Aave V3 Pool contract addresses
const POOL_ADDRESSES: Partial<Record<Chain, `0x${string}`>> = {
  [Chain.ETHEREUM]: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
  [Chain.ARBITRUM]: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  [Chain.POLYGON]: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  [Chain.OPTIMISM]: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  [Chain.BASE]: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
  [Chain.AVALANCHE]: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
};

const CHAIN_TO_VIEM: Partial<Record<Chain, ViemChain>> = {
  [Chain.ETHEREUM]: mainnet,
  [Chain.ARBITRUM]: arbitrum,
  [Chain.POLYGON]: polygon,
  [Chain.OPTIMISM]: optimism,
  [Chain.BASE]: base,
  [Chain.AVALANCHE]: avalanche,
};

// Minimal Aave V3 Pool ABI
const AAVE_POOL_ABI = [
  {
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "onBehalfOf", type: "address" },
      { name: "referralCode", type: "uint16" },
    ],
    name: "supply",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "to", type: "address" },
    ],
    name: "withdraw",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "interestRateMode", type: "uint256" },
      { name: "referralCode", type: "uint16" },
      { name: "onBehalfOf", type: "address" },
    ],
    name: "borrow",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "interestRateMode", type: "uint256" },
      { name: "onBehalfOf", type: "address" },
    ],
    name: "repay",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export class AaveV3Adapter implements ILendingAdapter {
  readonly protocolId = "aave-v3";
  readonly name = "Aave V3";
  readonly category = ProtocolCategory.LENDING;
  readonly websiteUrl = "https://app.aave.com";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;
  private ready = false;

  constructor(readonly chain: Chain) {
    if (!POOL_ADDRESSES[chain]) {
      throw new Error(`Aave V3 not supported on ${chain}`);
    }
  }

  async initialize(): Promise<void> {
    const viemChain = CHAIN_TO_VIEM[this.chain];
    if (!viemChain) throw new Error(`No viem chain config for ${this.chain}`);

    this.client = createPublicClient({
      chain: viemChain,
      transport: http(),
    });

    await this.client!.getBlockNumber();
    this.ready = true;
    logger.info(`Aave V3 adapter initialized on ${this.chain}`);
  }

  isReady(): boolean {
    return this.ready;
  }

  async getPools(): Promise<Pool[]> {
    logger.info("getPools: Use DefiLlama scanner for pool discovery");
    return [];
  }

  async getPoolAPR(poolId: string): Promise<APRBreakdown> {
    return { base: 0, reward: 0, total: 0, components: [] };
  }

  async getPosition(walletAddress: string, poolId: string): Promise<Position | null> {
    try {
      if (!this.client) throw new Error("Adapter not initialized");
      
      logger.info(`查询 Aave V3 持仓: ${walletAddress}, 池子: ${poolId}`);
      
      // 从池子 ID 中提取资产地址 (假设 poolId 是资产地址)
      const assetAddress = poolId as `0x${string}`;
      
      // 获取用户储备数据
      const userReserveData = await this.client.readContract({
        address: POOL_ADDRESSES[this.chain]!,
        abi: AAVE_POOL_ABI,
        functionName: "getUserReserveData",
        args: [assetAddress, walletAddress as `0x${string}`],
      });
      
      const aTokenBalance = userReserveData[0]; // currentATokenBalance
      
      if (aTokenBalance === 0n) {
        logger.info("用户在该资产上没有持仓");
        return null;
      }
      
      logger.info(`找到持仓: ${aTokenBalance.toString()} aTokens`);
      
      return {
        positionId: `${this.protocolId}:${this.chain}:${poolId}:${walletAddress}`,
        poolId: poolId,
        walletAddress: walletAddress,
        chain: this.chain,
        amountToken0: Number(aTokenBalance.toString()),
        amountToken1: 0,
        valueUsd: 0, // 需要价格数据来计算 USD 价值 - 修复类型错误
        unrealizedPnlUsd: 0,
        realizedPnlUsd: 0,
        status: "active",
        openedAt: new Date(),
      };
    } catch (error) {
      logger.error(`获取持仓失败: ${error}`);
      return null;
    }
  }

  async getAllPositions(walletAddress: string): Promise<Position[]> {
    return [];
  }

  async getPendingRewards(walletAddress: string, poolId: string) {
    return { tokens: [], totalValueUsd: 0 };
  }

  // ---- Lending-specific ----

  async getMarkets(): Promise<LendingMarket[]> {
    logger.info("Getting Aave V3 markets - use DefiLlama for discovery");
    return [];
  }

  async getBorrowPositions(walletAddress: string): Promise<BorrowPosition[]> {
    logger.info(`Getting borrow positions for ${walletAddress}`);
    return [];
  }

  async supply(params: { marketId: string; asset: string; amount: string }): Promise<TransactionPayload> {
    const poolAddress = POOL_ADDRESSES[this.chain]!;
    logger.info("Building Aave supply transaction", params);

    const data = encodeFunctionData({
      abi: AAVE_POOL_ABI,
      functionName: "supply",
      args: [
        params.asset as `0x${string}`,
        BigInt(params.amount),
        "0x0000000000000000000000000000000000000000" as `0x${string}`, // onBehalfOf - set by executor
        0, // referralCode
      ],
    });

    return { chain: this.chain, to: poolAddress, data };
  }

  async borrow(params: { marketId: string; asset: string; amount: string }): Promise<TransactionPayload> {
    const poolAddress = POOL_ADDRESSES[this.chain]!;
    logger.info("Building Aave borrow transaction", params);

    const data = encodeFunctionData({
      abi: AAVE_POOL_ABI,
      functionName: "borrow",
      args: [
        params.asset as `0x${string}`,
        BigInt(params.amount),
        2n, // Variable rate
        0, // referralCode
        "0x0000000000000000000000000000000000000000" as `0x${string}`,
      ],
    });

    return { chain: this.chain, to: poolAddress, data };
  }

  async repay(params: { marketId: string; asset: string; amount: string }): Promise<TransactionPayload> {
    const poolAddress = POOL_ADDRESSES[this.chain]!;
    logger.info("Building Aave repay transaction", params);

    const data = encodeFunctionData({
      abi: AAVE_POOL_ABI,
      functionName: "repay",
      args: [
        params.asset as `0x${string}`,
        BigInt(params.amount),
        2n,
        "0x0000000000000000000000000000000000000000" as `0x${string}`,
      ],
    });

    return { chain: this.chain, to: poolAddress, data };
  }

  async deposit(params: DepositParams): Promise<TransactionPayload> {
    return this.supply({
      marketId: params.poolId,
      asset: params.tokens[0]?.address || "",
      amount: params.tokens[0]?.amount || "0",
    });
  }

  async withdraw(params: WithdrawParams): Promise<TransactionPayload> {
    const poolAddress = POOL_ADDRESSES[this.chain]!;

    const data = encodeFunctionData({
      abi: AAVE_POOL_ABI,
      functionName: "withdraw",
      args: [
        "0x0000000000000000000000000000000000000000" as `0x${string}`,
        BigInt(params.lpAmount),
        "0x0000000000000000000000000000000000000000" as `0x${string}`,
      ],
    });

    return { chain: this.chain, to: poolAddress, data };
  }

  async harvest(_params: HarvestParams): Promise<TransactionPayload> {
    // Aave auto-accrues interest - no explicit harvest needed
    return { chain: this.chain, to: POOL_ADDRESSES[this.chain]!, data: "0x" };
  }

  async compound(_params: CompoundParams): Promise<TransactionPayload[]> {
    // Aave auto-compounds - no explicit action needed
    return [];
  }
}
