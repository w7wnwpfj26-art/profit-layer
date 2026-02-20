// ============================================
// Curve Finance Protocol Adapter
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
import { mainnet, arbitrum, polygon, optimism, avalanche } from "viem/chains";
import type { ILPAdapter, LPInfo } from "../../base/ILPAdapter.js";

const logger = createLogger("adapters:curve");

const REGISTRY_ADDRESSES: Partial<Record<Chain, `0x${string}`>> = {
  [Chain.ETHEREUM]: "0x90E00ACe148ca3b23Ac1bC8C240C2a7Dd9c2d7f5",
  [Chain.ARBITRUM]: "0x0000000022D53366457F9d5E68Ec105046FC4383",
  [Chain.POLYGON]: "0x0000000022D53366457F9d5E68Ec105046FC4383",
};

const CHAIN_TO_VIEM: Partial<Record<Chain, ViemChain>> = {
  [Chain.ETHEREUM]: mainnet,
  [Chain.ARBITRUM]: arbitrum,
  [Chain.POLYGON]: polygon,
  [Chain.OPTIMISM]: optimism,
  [Chain.AVALANCHE]: avalanche,
};

export class CurveAdapter implements ILPAdapter {
  readonly protocolId = "curve";
  readonly name = "Curve Finance";
  readonly category = ProtocolCategory.DEX;
  readonly websiteUrl = "https://curve.fi";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;
  private ready = false;

  constructor(readonly chain: Chain) {}

  async initialize(): Promise<void> {
    const viemChain = CHAIN_TO_VIEM[this.chain];
    if (!viemChain) throw new Error(`Curve not supported on ${this.chain}`);
    this.client = createPublicClient({ chain: viemChain, transport: http() });
    await this.client!.getBlockNumber();
    this.ready = true;
    logger.info(`Curve adapter initialized on ${this.chain}`);
  }

  isReady(): boolean { return this.ready; }
  async getPools(): Promise<Pool[]> { return []; }
  async getPoolAPR(poolId: string): Promise<APRBreakdown> {
    return { base: 0, reward: 0, total: 0, components: [{ source: "trading-fees", apr: 0 }, { source: "CRV-rewards", apr: 0 }] };
  }
  async getPosition(walletAddress: string, poolId: string): Promise<Position | null> { return null; }
  async getAllPositions(walletAddress: string): Promise<Position[]> { return []; }
  async getPendingRewards(walletAddress: string, poolId: string) { return { tokens: [], totalValueUsd: 0 }; }
  async getLPInfo(poolId: string): Promise<LPInfo> {
    return { poolId, lpTokenAddress: poolId, token0: { address: "", symbol: "", reserve: "0" }, token1: { address: "", symbol: "", reserve: "0" }, totalLpSupply: "0", fee: 0.0004 };
  }
  async quoteDeposit(params: { poolId: string; amountToken0?: string; amountToken1?: string }) {
    return { amountToken0: params.amountToken0 || "0", amountToken1: params.amountToken1 || "0", lpTokensExpected: "0", priceImpactPct: 0 };
  }
  async quoteWithdraw(params: { poolId: string; lpAmount: string }) { return { amountToken0: "0", amountToken1: "0" }; }
  async swap(params: { poolId: string; tokenIn: string; tokenOut: string; amountIn: string; minAmountOut: string }): Promise<TransactionPayload> {
    return { chain: this.chain, to: REGISTRY_ADDRESSES[this.chain] || "0x", data: "0x" };
  }
  async deposit(params: DepositParams): Promise<TransactionPayload> {
    return { chain: this.chain, to: params.poolId, data: "0x" };
  }
  async withdraw(params: WithdrawParams): Promise<TransactionPayload> {
    return { chain: this.chain, to: params.poolId, data: "0x" };
  }
  async harvest(params: HarvestParams): Promise<TransactionPayload> {
    return { chain: this.chain, to: "0x", data: "0x" };
  }
  async compound(params: CompoundParams): Promise<TransactionPayload[]> {
    const h = await this.harvest({ poolId: params.poolId });
    return [h];
  }
}
