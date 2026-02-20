// ============================================
// Staking Protocol Adapter Interface
// ============================================

import type { TransactionPayload } from "@profitlayer/common";
import type { IProtocolAdapter } from "./IProtocolAdapter.js";

export interface StakingInfo {
  stakingId: string;
  asset: string;
  assetSymbol: string;
  liquidToken: string;
  liquidTokenSymbol: string;
  apr: number;
  totalStaked: string;
  totalStakedUsd: number;
  exchangeRate: number;      // liquid token per staked token
  unbondingPeriod?: number;  // seconds
  minStake?: string;
}

export interface StakingPosition {
  stakingId: string;
  stakedAmount: string;
  stakedValueUsd: number;
  liquidTokenBalance: string;
  pendingRewards: string;
  pendingRewardsUsd: number;
}

/**
 * Extended adapter for liquid staking protocols (Lido, Marinade, etc.)
 */
export interface IStakingAdapter extends IProtocolAdapter {
  /** Get staking options */
  getStakingInfo(): Promise<StakingInfo[]>;

  /** Get user's staking position */
  getStakingPosition(walletAddress: string, stakingId: string): Promise<StakingPosition | null>;

  /** Build stake transaction */
  stake(params: {
    stakingId: string;
    amount: string;
  }): Promise<TransactionPayload>;

  /** Build unstake/withdraw transaction */
  unstake(params: {
    stakingId: string;
    amount: string;
  }): Promise<TransactionPayload>;
}
