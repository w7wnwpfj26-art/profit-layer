// ============================================
// Marinade Finance Liquid Staking Adapter (Solana)
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
import { Connection, PublicKey } from "@solana/web3.js";
import type { IStakingAdapter, StakingInfo, StakingPosition } from "../../base/IStakingAdapter.js";

const logger = createLogger("adapters:marinade");

const MARINADE_PROGRAM = new PublicKey("MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD");

export class MarinadeAdapter implements IStakingAdapter {
  readonly protocolId = "marinade";
  readonly name = "Marinade Finance";
  readonly chain = Chain.SOLANA;
  readonly category = ProtocolCategory.STAKING;
  readonly websiteUrl = "https://marinade.finance";

  private connection: Connection | null = null;
  private ready = false;

  async initialize(): Promise<void> {
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
    this.connection = new Connection(rpcUrl, "confirmed");
    await this.connection.getSlot();
    this.ready = true;
    logger.info("Marinade adapter initialized on Solana");
  }

  isReady(): boolean { return this.ready; }
  async getPools(): Promise<Pool[]> { return []; }
  async getPoolAPR(_poolId: string): Promise<APRBreakdown> {
    return { base: 7.2, reward: 0, total: 7.2, components: [{ source: "sol-staking", apr: 7.2 }] };
  }
  async getPosition(walletAddress: string, poolId: string): Promise<Position | null> { return null; }
  async getAllPositions(walletAddress: string): Promise<Position[]> { return []; }
  async getPendingRewards(walletAddress: string, poolId: string) { return { tokens: [], totalValueUsd: 0 }; }

  async getStakingInfo(): Promise<StakingInfo[]> {
    return [{
      stakingId: "sol-msol",
      asset: "SOL",
      assetSymbol: "SOL",
      liquidToken: "mSOL",
      liquidTokenSymbol: "mSOL",
      apr: 7.2,
      totalStaked: "0",
      totalStakedUsd: 1_500_000_000,
      exchangeRate: 1.05,
    }];
  }

  async getStakingPosition(walletAddress: string, stakingId: string): Promise<StakingPosition | null> { return null; }

  async stake(params: { stakingId: string; amount: string }): Promise<TransactionPayload> {
    return { chain: Chain.SOLANA, to: MARINADE_PROGRAM.toBase58(), solanaInstruction: {} };
  }
  async unstake(params: { stakingId: string; amount: string }): Promise<TransactionPayload> {
    return { chain: Chain.SOLANA, to: MARINADE_PROGRAM.toBase58(), solanaInstruction: {} };
  }
  async deposit(params: DepositParams): Promise<TransactionPayload> {
    return this.stake({ stakingId: "sol-msol", amount: params.tokens[0]?.amount || "0" });
  }
  async withdraw(params: WithdrawParams): Promise<TransactionPayload> {
    return this.unstake({ stakingId: "sol-msol", amount: params.lpAmount });
  }
  async harvest(_params: HarvestParams): Promise<TransactionPayload> {
    return { chain: Chain.SOLANA, to: MARINADE_PROGRAM.toBase58(), solanaInstruction: {} };
  }
  async compound(_params: CompoundParams): Promise<TransactionPayload[]> { return []; }
}
