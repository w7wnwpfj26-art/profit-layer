// ============================================
// Aerodrome Finance Protocol Adapter (Base)
// Supports: aerodrome-v1 (Classic AMM) & aerodrome-slipstream (Concentrated Liquidity)
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
} from "@defi-yield/common";
import { createPublicClient, http, encodeFunctionData, type Chain as ViemChain } from "viem";
import { base } from "viem/chains";
import type { ILPAdapter, LPInfo } from "../../base/ILPAdapter.js";

const logger = createLogger("adapters:aerodrome");

// Aerodrome contract addresses on Base
const AERODROME_ROUTER = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as const;
const AERODROME_VOTER = "0x16613524e02ad97eDfeF371bC883F2F5d6C480A5" as const;
const SLIPSTREAM_POSITION_MANAGER = "0x827922686190790b37229fd06084350E74485b72" as const;

// Minimal ABIs
const ROUTER_ABI = [
  {
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "stable", type: "bool" },
      { name: "amountADesired", type: "uint256" },
      { name: "amountBDesired", type: "uint256" },
      { name: "amountAMin", type: "uint256" },
      { name: "amountBMin", type: "uint256" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    name: "addLiquidity",
    outputs: [
      { name: "amountA", type: "uint256" },
      { name: "amountB", type: "uint256" },
      { name: "liquidity", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "stable", type: "bool" },
      { name: "liquidity", type: "uint256" },
      { name: "amountAMin", type: "uint256" },
      { name: "amountBMin", type: "uint256" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    name: "removeLiquidity",
    outputs: [
      { name: "amountA", type: "uint256" },
      { name: "amountB", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const GAUGE_ABI = [
  {
    inputs: [],
    name: "getReward",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "amount", type: "uint256" }],
    name: "deposit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "amount", type: "uint256" }],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const SLIPSTREAM_ABI = [
  {
    inputs: [
      {
        components: [
          { name: "token0", type: "address" },
          { name: "token1", type: "address" },
          { name: "tickSpacing", type: "int24" },
          { name: "tickLower", type: "int24" },
          { name: "tickUpper", type: "int24" },
          { name: "amount0Desired", type: "uint256" },
          { name: "amount1Desired", type: "uint256" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
          { name: "sqrtPriceX96", type: "uint160" },
        ],
        name: "params",
        type: "tuple",
      },
    ],
    name: "mint",
    outputs: [
      { name: "tokenId", type: "uint256" },
      { name: "liquidity", type: "uint128" },
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { name: "tokenId", type: "uint256" },
          { name: "recipient", type: "address" },
          { name: "amount0Max", type: "uint128" },
          { name: "amount1Max", type: "uint128" },
        ],
        name: "params",
        type: "tuple",
      },
    ],
    name: "collect",
    outputs: [
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
    stateMutability: "payable",
    type: "function",
  },
] as const;

// ---- Aerodrome V1 (Classic AMM) ----

export class AerodromeV1Adapter implements ILPAdapter {
  readonly protocolId = "aerodrome-v1";
  readonly name = "Aerodrome V1";
  readonly chain = Chain.BASE;
  readonly category = ProtocolCategory.DEX;
  readonly websiteUrl = "https://aerodrome.finance";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;
  private ready = false;

  async initialize(): Promise<void> {
    this.client = createPublicClient({
      chain: base,
      transport: http(),
    });
    await this.client.getBlockNumber();
    this.ready = true;
    logger.info("Aerodrome V1 adapter initialized on Base");
  }

  isReady(): boolean {
    return this.ready;
  }

  async getPools(): Promise<Pool[]> {
    logger.info("getPools: Use DefiLlama scanner for pool discovery");
    return [];
  }

  async getPoolAPR(poolId: string): Promise<APRBreakdown> {
    logger.info(`Getting APR for pool ${poolId}`);
    return {
      base: 0,
      reward: 0,
      total: 0,
      components: [
        { source: "trading-fees", apr: 0 },
        { source: "AERO-emissions", apr: 0 },
      ],
    };
  }

  async getPosition(walletAddress: string, poolId: string): Promise<Position | null> {
    logger.info(`Getting position for ${walletAddress} in pool ${poolId}`);
    return null;
  }

  async getAllPositions(walletAddress: string): Promise<Position[]> {
    logger.info(`Getting all positions for ${walletAddress}`);
    return [];
  }

  async getPendingRewards(walletAddress: string, poolId: string) {
    return { tokens: [], totalValueUsd: 0 };
  }

  async getLPInfo(poolId: string): Promise<LPInfo> {
    return {
      poolId,
      lpTokenAddress: poolId,
      token0: { address: "", symbol: "", reserve: "0" },
      token1: { address: "", symbol: "", reserve: "0" },
      totalLpSupply: "0",
      fee: 0.003,
    };
  }

  async quoteDeposit(params: { poolId: string; amountToken0?: string; amountToken1?: string }) {
    return {
      amountToken0: params.amountToken0 || "0",
      amountToken1: params.amountToken1 || "0",
      lpTokensExpected: "0",
      priceImpactPct: 0,
    };
  }

  async quoteWithdraw(params: { poolId: string; lpAmount: string }) {
    return { amountToken0: "0", amountToken1: "0" };
  }

  async swap(params: {
    poolId: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    minAmountOut: string;
  }): Promise<TransactionPayload> {
    logger.info("Building swap transaction", params);
    return {
      chain: this.chain,
      to: AERODROME_ROUTER,
      data: "0x",
    };
  }

  async deposit(params: DepositParams): Promise<TransactionPayload> {
    logger.info("Building deposit (addLiquidity) transaction", { poolId: params.poolId });

    // 如果没有代币信息，返回占位符交易（需要从链上查询池子信息）
    if (!params.tokens || params.tokens.length < 2) {
      logger.warn("No token info provided, skipping deposit");
      return {
        chain: this.chain,
        to: AERODROME_ROUTER,
        data: "0x",
        value: "0",
      };
    }

    const data = encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: "addLiquidity",
      args: [
        (params.tokens[0]?.address || "0x") as `0x${string}`,
        (params.tokens[1]?.address || "0x") as `0x${string}`,
        false, // stable = false for volatile pairs
        BigInt(params.tokens[0]?.amount || "0"),
        BigInt(params.tokens[1]?.amount || "0"),
        params.slippagePct
          ? BigInt(params.tokens[0]?.amount || "0") * BigInt(Math.floor((1 - (params.slippagePct / 100)) * 10000)) / 10000n
          : 0n,
        params.slippagePct
          ? BigInt(params.tokens[1]?.amount || "0") * BigInt(Math.floor((1 - (params.slippagePct / 100)) * 10000)) / 10000n
          : 0n,
        (params.recipient || "") as `0x${string}`,
        BigInt(Math.floor(Date.now() / 1000) + 1800),
      ],
    });

    return {
      chain: this.chain,
      to: AERODROME_ROUTER,
      data,
      value: "0",
    };
  }

  async withdraw(params: WithdrawParams): Promise<TransactionPayload> {
    logger.info("Building withdraw (removeLiquidity) transaction", { poolId: params.poolId });

    const data = encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: "removeLiquidity",
      args: [
        (params.minAmounts?.[0]?.address || "0x") as `0x${string}`,
        (params.minAmounts?.[1]?.address || "0x") as `0x${string}`,
        false,
        BigInt(params.lpAmount || "0"),
        0n,
        0n,
        (params.recipient || "") as `0x${string}`,
        BigInt(Math.floor(Date.now() / 1000) + 1800),
      ],
    });

    return {
      chain: this.chain,
      to: AERODROME_ROUTER,
      data,
    };
  }

  async harvest(params: HarvestParams): Promise<TransactionPayload> {
    logger.info("Building harvest (getReward) transaction", { poolId: params.poolId });

    const data = encodeFunctionData({
      abi: GAUGE_ABI,
      functionName: "getReward",
      args: [],
    });

    return {
      chain: this.chain,
      to: params.poolId as `0x${string}`, // gauge address
      data,
    };
  }

  async compound(params: CompoundParams): Promise<TransactionPayload[]> {
    logger.info("Building compound transactions", { poolId: params.poolId });
    const harvestTx = await this.harvest({ poolId: params.poolId });
    return [harvestTx];
  }
}

// ---- Aerodrome Slipstream (Concentrated Liquidity) ----

export class AerodromeSlipstreamAdapter implements ILPAdapter {
  readonly protocolId = "aerodrome-slipstream";
  readonly name = "Aerodrome Slipstream";
  readonly chain = Chain.BASE;
  readonly category = ProtocolCategory.DEX;
  readonly websiteUrl = "https://aerodrome.finance";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;
  private ready = false;

  async initialize(): Promise<void> {
    this.client = createPublicClient({
      chain: base,
      transport: http(),
    });
    await this.client.getBlockNumber();
    this.ready = true;
    logger.info("Aerodrome Slipstream adapter initialized on Base");
  }

  isReady(): boolean {
    return this.ready;
  }

  async getPools(): Promise<Pool[]> {
    return [];
  }

  async getPoolAPR(poolId: string): Promise<APRBreakdown> {
    return {
      base: 0,
      reward: 0,
      total: 0,
      components: [
        { source: "trading-fees", apr: 0 },
        { source: "AERO-emissions", apr: 0 },
      ],
    };
  }

  async getPosition(walletAddress: string, poolId: string): Promise<Position | null> {
    return null;
  }

  async getAllPositions(walletAddress: string): Promise<Position[]> {
    return [];
  }

  async getPendingRewards(walletAddress: string, poolId: string) {
    return { tokens: [], totalValueUsd: 0 };
  }

  async getLPInfo(poolId: string): Promise<LPInfo> {
    return {
      poolId,
      lpTokenAddress: poolId,
      token0: { address: "", symbol: "", reserve: "0" },
      token1: { address: "", symbol: "", reserve: "0" },
      totalLpSupply: "0",
      fee: 0.0005,
    };
  }

  async quoteDeposit(params: { poolId: string; amountToken0?: string; amountToken1?: string }) {
    return {
      amountToken0: params.amountToken0 || "0",
      amountToken1: params.amountToken1 || "0",
      lpTokensExpected: "0",
      priceImpactPct: 0,
    };
  }

  async quoteWithdraw(params: { poolId: string; lpAmount: string }) {
    return { amountToken0: "0", amountToken1: "0" };
  }

  async swap(params: {
    poolId: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    minAmountOut: string;
  }): Promise<TransactionPayload> {
    return {
      chain: this.chain,
      to: SLIPSTREAM_POSITION_MANAGER,
      data: "0x",
    };
  }

  async deposit(params: DepositParams): Promise<TransactionPayload> {
    logger.info("Building Slipstream deposit (mint) transaction", { poolId: params.poolId });

    // 如果没有代币信息，返回占位符交易
    if (!params.tokens || params.tokens.length < 2) {
      logger.warn("No token info provided, skipping deposit");
      return {
        chain: this.chain,
        to: SLIPSTREAM_POSITION_MANAGER,
        data: "0x",
        value: "0",
      };
    }

    const data = encodeFunctionData({
      abi: SLIPSTREAM_ABI,
      functionName: "mint",
      args: [
        {
          token0: (params.tokens[0]?.address || "0x") as `0x${string}`,
          token1: (params.tokens[1]?.address || "0x") as `0x${string}`,
          tickSpacing: 100, // common tick spacing
          tickLower: -887200,
          tickUpper: 887200,
          amount0Desired: BigInt(params.tokens[0]?.amount || "0"),
          amount1Desired: BigInt(params.tokens[1]?.amount || "0"),
          amount0Min: params.slippagePct
            ? BigInt(params.tokens[0]?.amount || "0") * BigInt(Math.floor((1 - (params.slippagePct / 100)) * 10000)) / 10000n
            : 0n,
          amount1Min: params.slippagePct
            ? BigInt(params.tokens[1]?.amount || "0") * BigInt(Math.floor((1 - (params.slippagePct / 100)) * 10000)) / 10000n
            : 0n,
          recipient: (params.recipient || "") as `0x${string}`,
          deadline: BigInt(Math.floor(Date.now() / 1000) + 1800),
          sqrtPriceX96: 0n,
        },
      ],
    });

    return {
      chain: this.chain,
      to: SLIPSTREAM_POSITION_MANAGER,
      data,
      value: "0",
    };
  }

  async withdraw(params: WithdrawParams): Promise<TransactionPayload> {
    logger.info("Building Slipstream withdraw transaction", { poolId: params.poolId });
    return {
      chain: this.chain,
      to: SLIPSTREAM_POSITION_MANAGER,
      data: "0x",
    };
  }

  async harvest(params: HarvestParams): Promise<TransactionPayload> {
    logger.info("Building Slipstream harvest (collect) transaction", { poolId: params.poolId });

    const data = encodeFunctionData({
      abi: SLIPSTREAM_ABI,
      functionName: "collect",
      args: [
        {
          tokenId: BigInt(params.positionId || "0"),
          recipient: (params.recipient || "") as `0x${string}`,
          amount0Max: BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"),
          amount1Max: BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"),
        },
      ],
    });

    return {
      chain: this.chain,
      to: SLIPSTREAM_POSITION_MANAGER,
      data,
    };
  }

  async compound(params: CompoundParams): Promise<TransactionPayload[]> {
    const harvestTx = await this.harvest({ poolId: params.poolId, positionId: params.positionId });
    return [harvestTx];
  }
}
