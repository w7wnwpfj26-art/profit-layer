// ============================================
// Uniswap V3 Protocol Adapter
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
import { mainnet, arbitrum, polygon, optimism, base } from "viem/chains";
import type { ILPAdapter, LPInfo } from "../../base/ILPAdapter.js";

const logger = createLogger("adapters:uniswap-v3");

// Uniswap V3 contract addresses
const FACTORY_ADDRESSES: Partial<Record<Chain, `0x${string}`>> = {
  [Chain.ETHEREUM]: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  [Chain.ARBITRUM]: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  [Chain.POLYGON]: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  [Chain.OPTIMISM]: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  [Chain.BASE]: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
};

const POSITION_MANAGER_ADDRESSES: Partial<Record<Chain, `0x${string}`>> = {
  [Chain.ETHEREUM]: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  [Chain.ARBITRUM]: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  [Chain.POLYGON]: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  [Chain.OPTIMISM]: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  [Chain.BASE]: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
};

const CHAIN_TO_VIEM: Partial<Record<Chain, ViemChain>> = {
  [Chain.ETHEREUM]: mainnet,
  [Chain.ARBITRUM]: arbitrum,
  [Chain.POLYGON]: polygon,
  [Chain.OPTIMISM]: optimism,
  [Chain.BASE]: base,
};

// Minimal ABIs
const NONFUNGIBLE_POSITION_MANAGER_ABI = [
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "positions",
    outputs: [
      { name: "nonce", type: "uint96" },
      { name: "operator", type: "address" },
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
      { name: "liquidity", type: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256" },
      { name: "feeGrowthInside1LastX128", type: "uint256" },
      { name: "tokensOwed0", type: "uint128" },
      { name: "tokensOwed1", type: "uint128" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { name: "token0", type: "address" },
          { name: "token1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickLower", type: "int24" },
          { name: "tickUpper", type: "int24" },
          { name: "amount0Desired", type: "uint256" },
          { name: "amount1Desired", type: "uint256" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
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

export class UniswapV3Adapter implements ILPAdapter {
  readonly protocolId = "uniswap-v3";
  readonly name = "Uniswap V3";
  readonly category = ProtocolCategory.DEX;
  readonly websiteUrl = "https://app.uniswap.org";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;
  private ready = false;

  constructor(readonly chain: Chain) {
    if (!FACTORY_ADDRESSES[chain]) {
      throw new Error(`Uniswap V3 not supported on ${chain}`);
    }
  }

  async initialize(): Promise<void> {
    const viemChain = CHAIN_TO_VIEM[this.chain];
    if (!viemChain) throw new Error(`No viem chain config for ${this.chain}`);

    this.client = createPublicClient({
      chain: viemChain,
      transport: http(),
    });

    // Test connection
    await this.client!.getBlockNumber();
    this.ready = true;
    logger.info(`Uniswap V3 adapter initialized on ${this.chain}`);
  }

  isReady(): boolean {
    return this.ready;
  }

  async getPools(): Promise<Pool[]> {
    // Pools come from DefiLlama scanner; this method is for on-chain supplementation
    logger.info("getPools: Use DefiLlama scanner for pool discovery");
    return [];
  }

  async getPoolAPR(poolId: string): Promise<APRBreakdown> {
    logger.info(`Getting APR for pool ${poolId}`);
    // On-chain APR calculation based on fee tier and volume
    return {
      base: 0,
      reward: 0,
      total: 0,
      components: [{ source: "trading-fees", apr: 0 }],
    };
  }

  async getPosition(walletAddress: string, poolId: string): Promise<Position | null> {
    logger.info(`Getting position for ${walletAddress} in pool ${poolId}`);
    // Query NonfungiblePositionManager for user's positions
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
      to: POSITION_MANAGER_ADDRESSES[this.chain]!,
      data: "0x",
    };
  }

  async deposit(params: DepositParams): Promise<TransactionPayload> {
    const positionManager = POSITION_MANAGER_ADDRESSES[this.chain]!;
    logger.info("Building deposit (mint) transaction", { poolId: params.poolId });

    // Build the mint calldata
    const data = encodeFunctionData({
      abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
      functionName: "mint",
      args: [
        {
          token0: (params.tokens[0]?.address || "0x") as `0x${string}`,
          token1: (params.tokens[1]?.address || "0x") as `0x${string}`,
          fee: 3000, // 0.3% fee tier
          tickLower: -887220,
          tickUpper: 887220,
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
        },
      ],
    });

    return {
      chain: this.chain,
      to: positionManager,
      data,
      value: "0",
    };
  }

  async withdraw(params: WithdrawParams): Promise<TransactionPayload> {
    logger.info("Building withdraw transaction", { poolId: params.poolId });
    return {
      chain: this.chain,
      to: POSITION_MANAGER_ADDRESSES[this.chain]!,
      data: "0x",
    };
  }

  async harvest(params: HarvestParams): Promise<TransactionPayload> {
    const positionManager = POSITION_MANAGER_ADDRESSES[this.chain]!;
    logger.info("Building harvest (collect) transaction", { poolId: params.poolId });

    const data = encodeFunctionData({
      abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
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
      to: positionManager,
      data,
    };
  }

  async compound(params: CompoundParams): Promise<TransactionPayload[]> {
    logger.info("Building compound transactions", { poolId: params.poolId });
    // Step 1: Harvest rewards
    const harvestTx = await this.harvest({ poolId: params.poolId, positionId: params.positionId });
    // Step 2: Re-deposit (would need swap + mint in practice)
    return [harvestTx];
  }
}
