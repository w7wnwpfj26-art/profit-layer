// ============================================
// Uniswap V4 Protocol Adapter
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
import { mainnet, arbitrum, polygon, optimism, base } from "viem/chains";
import type { ILPAdapter, LPInfo } from "../../base/ILPAdapter.js";

const logger = createLogger("adapters:uniswap-v4");

// Uniswap V4 PoolManager addresses
const POOL_MANAGER_ADDRESSES: Partial<Record<Chain, `0x${string}`>> = {
  [Chain.ETHEREUM]: "0x000000000004444c5dc75cB358380D2e3dE08A90",
  [Chain.ARBITRUM]: "0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32",
  [Chain.POLYGON]: "0x67366782805870060151383F0aBBc6b17b77b6b0",
  [Chain.OPTIMISM]: "0x9a13F98Cb987694C9F086b2Eb650C08287F49E1B",
  [Chain.BASE]: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
};

// Position Manager addresses
const POSITION_MANAGER_ADDRESSES: Partial<Record<Chain, `0x${string}`>> = {
  [Chain.ETHEREUM]: "0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e",
  [Chain.ARBITRUM]: "0xd88F38F930b7952f2DB2432Cb002E7abbF3dD869",
  [Chain.POLYGON]: "0x1Ec2eBf4F37E7363FDFd7df8d0F8E53b57C2E87B",
  [Chain.OPTIMISM]: "0x3C3Ea4B57a46241e54610e5f022E5c45859A1017",
  [Chain.BASE]: "0x7C5f5A4bBd8fD63184577525326123B519429bDc",
};

const CHAIN_TO_VIEM: Partial<Record<Chain, ViemChain>> = {
  [Chain.ETHEREUM]: mainnet,
  [Chain.ARBITRUM]: arbitrum,
  [Chain.POLYGON]: polygon,
  [Chain.OPTIMISM]: optimism,
  [Chain.BASE]: base,
};

// Minimal ABIs
const POSITION_MANAGER_ABI = [
  {
    inputs: [
      {
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
        name: "poolKey",
        type: "tuple",
      },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
      { name: "liquidity", type: "uint256" },
      { name: "amount0Max", type: "uint128" },
      { name: "amount1Max", type: "uint128" },
      { name: "owner", type: "address" },
      { name: "hookData", type: "bytes" },
    ],
    name: "mint",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "liquidity", type: "uint128" },
      { name: "amount0Min", type: "uint128" },
      { name: "amount1Min", type: "uint128" },
      { name: "hookData", type: "bytes" },
    ],
    name: "decreaseLiquidity",
    outputs: [
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    name: "collect",
    outputs: [
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export class UniswapV4Adapter implements ILPAdapter {
  readonly protocolId = "uniswap-v4";
  readonly name = "Uniswap V4";
  readonly category = ProtocolCategory.DEX;
  readonly websiteUrl = "https://app.uniswap.org";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;
  private ready = false;

  constructor(readonly chain: Chain) {
    if (!POOL_MANAGER_ADDRESSES[chain]) {
      throw new Error(`Uniswap V4 not supported on ${chain}`);
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
    logger.info(`Uniswap V4 adapter initialized on ${this.chain}`);
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
      components: [{ source: "trading-fees", apr: 0 }],
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
      to: POOL_MANAGER_ADDRESSES[this.chain]!,
      data: "0x",
    };
  }

  async deposit(params: DepositParams): Promise<TransactionPayload> {
    const positionManager = POSITION_MANAGER_ADDRESSES[this.chain]!;
    logger.info("Building V4 deposit (mint) transaction", { poolId: params.poolId });

    // 如果没有代币信息，返回占位符交易
    if (!params.tokens || params.tokens.length < 2) {
      logger.warn("No token info provided, skipping deposit");
      return {
        chain: this.chain,
        to: positionManager,
        data: "0x",
        value: "0",
      };
    }

    const data = encodeFunctionData({
      abi: POSITION_MANAGER_ABI,
      functionName: "mint",
      args: [
        {
          currency0: (params.tokens[0]?.address || "0x") as `0x${string}`,
          currency1: (params.tokens[1]?.address || "0x") as `0x${string}`,
          fee: 3000, // 0.3% fee tier
          tickSpacing: 60,
          hooks: "0x0000000000000000000000000000000000000000" as `0x${string}`,
        },
        -887220,  // tickLower
        887220,   // tickUpper
        BigInt(params.tokens[0]?.amount || "0"),
        BigInt(2n ** 128n - 1n),  // amount0Max
        BigInt(2n ** 128n - 1n),  // amount1Max
        (params.recipient || "") as `0x${string}`,
        "0x",
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
      abi: POSITION_MANAGER_ABI,
      functionName: "collect",
      args: [
        BigInt(params.positionId || "0"),
        (params.recipient || "") as `0x${string}`,
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
    const harvestTx = await this.harvest({ poolId: params.poolId, positionId: params.positionId });
    return [harvestTx];
  }
}
