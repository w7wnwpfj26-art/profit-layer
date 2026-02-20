// ============================================
// Compound V3 (Comet) Lending Adapter
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
import { mainnet, arbitrum, polygon, base } from "viem/chains";
import type { ILendingAdapter, LendingMarket, BorrowPosition } from "../../base/ILendingAdapter.js";

const logger = createLogger("adapters:compound-v3");

// Compound III (Comet) USDC market addresses
const COMET_ADDRESSES: Partial<Record<Chain, `0x${string}`>> = {
  [Chain.ETHEREUM]: "0xc3d688B66703497DAA19211EEdff47f25384cdc3",
  [Chain.ARBITRUM]: "0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA",
  [Chain.POLYGON]: "0xF25212E676D1F7F89Cd72fFEe66158f541246445",
  [Chain.BASE]: "0xb125E6687d4313864e53df431d5425969c15Eb2F",
};

const COMET_ABI = [
  { inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }], name: "supply", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }], name: "withdraw", outputs: [], stateMutability: "nonpayable", type: "function" },
] as const;

const CHAIN_TO_VIEM: Partial<Record<Chain, ViemChain>> = {
  [Chain.ETHEREUM]: mainnet,
  [Chain.ARBITRUM]: arbitrum,
  [Chain.POLYGON]: polygon,
  [Chain.BASE]: base,
};

export class CompoundV3Adapter implements ILendingAdapter {
  readonly protocolId = "compound-v3";
  readonly name = "Compound V3";
  readonly category = ProtocolCategory.LENDING;
  readonly websiteUrl = "https://app.compound.finance";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;
  private ready = false;

  constructor(readonly chain: Chain) {}

  async initialize(): Promise<void> {
    const viemChain = CHAIN_TO_VIEM[this.chain];
    if (!viemChain) throw new Error(`Compound V3 not on ${this.chain}`);
    this.client = createPublicClient({ chain: viemChain, transport: http() });
    await this.client!.getBlockNumber();
    this.ready = true;
    logger.info(`Compound V3 adapter initialized on ${this.chain}`);
  }

  isReady(): boolean { return this.ready; }
  async getPools(): Promise<Pool[]> { return []; }
  async getPoolAPR(poolId: string): Promise<APRBreakdown> { return { base: 0, reward: 0, total: 0, components: [] }; }
  async getPosition(walletAddress: string, poolId: string): Promise<Position | null> { return null; }
  async getAllPositions(walletAddress: string): Promise<Position[]> { return []; }
  async getPendingRewards(walletAddress: string, poolId: string) { return { tokens: [], totalValueUsd: 0 }; }

  async getMarkets(): Promise<LendingMarket[]> { return []; }
  async getBorrowPositions(walletAddress: string): Promise<BorrowPosition[]> { return []; }

  async supply(params: { marketId: string; asset: string; amount: string }): Promise<TransactionPayload> {
    const comet = COMET_ADDRESSES[this.chain]!;
    const data = encodeFunctionData({ abi: COMET_ABI, functionName: "supply", args: [params.asset as `0x${string}`, BigInt(params.amount)] });
    return { chain: this.chain, to: comet, data };
  }

  async borrow(params: { marketId: string; asset: string; amount: string }): Promise<TransactionPayload> {
    const comet = COMET_ADDRESSES[this.chain]!;
    const data = encodeFunctionData({ abi: COMET_ABI, functionName: "withdraw", args: [params.asset as `0x${string}`, BigInt(params.amount)] });
    return { chain: this.chain, to: comet, data };
  }

  async repay(params: { marketId: string; asset: string; amount: string }): Promise<TransactionPayload> {
    return this.supply(params); // Repay = supply in Compound V3
  }

  async deposit(params: DepositParams): Promise<TransactionPayload> {
    return this.supply({ marketId: params.poolId, asset: params.tokens[0]?.address || "", amount: params.tokens[0]?.amount || "0" });
  }
  async withdraw(params: WithdrawParams): Promise<TransactionPayload> {
    return { chain: this.chain, to: COMET_ADDRESSES[this.chain]!, data: "0x" };
  }
  async harvest(_params: HarvestParams): Promise<TransactionPayload> {
    return { chain: this.chain, to: COMET_ADDRESSES[this.chain]!, data: "0x" };
  }
  async compound(_params: CompoundParams): Promise<TransactionPayload[]> { return []; }
}
