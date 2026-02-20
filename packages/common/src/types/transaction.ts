// ============================================
// Transaction Types
// ============================================

import { Chain } from "./chain.js";

export enum TxType {
  DEPOSIT = "deposit",
  WITHDRAW = "withdraw",
  HARVEST = "harvest",
  SWAP = "swap",
  COMPOUND = "compound",
  APPROVE = "approve",
  STAKE = "stake",
  UNSTAKE = "unstake",
  WRAP = "wrap",
  UNWRAP = "unwrap",
}

export enum TxStatus {
  PENDING = "pending",
  SIMULATING = "simulating",
  SUBMITTED = "submitted",
  CONFIRMED = "confirmed",
  FAILED = "failed",
  REJECTED = "rejected",     // Rejected by risk checks
}

export interface TransactionPayload {
  chain: Chain;
  to: string;
  data?: string;
  value?: string;
  // EVM specific
  gasLimit?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  // Aptos specific
  aptosPayload?: unknown;
  // Solana specific
  solanaInstruction?: unknown;
}

export interface TransactionRecord {
  txHash: string;
  chain: Chain;
  protocolId?: string;
  poolId?: string;
  positionId?: string;
  walletAddress: string;
  txType: TxType;
  amountUsd?: number;
  gasCostUsd?: number;
  status: TxStatus;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  confirmedAt?: Date;
}

export interface DepositParams {
  poolId: string;
  tokens: { address: string; amount: string }[];
  recipient?: string;         // Wallet address to receive LP tokens/NFT
  minLpAmount?: string;
  slippagePct?: number;
}

export interface WithdrawParams {
  poolId: string;
  lpAmount: string;
  recipient?: string;         // Wallet address to receive withdrawn tokens
  minAmounts?: { address: string; amount: string }[];
  slippagePct?: number;
}

export interface HarvestParams {
  poolId: string;
  positionId?: string;
  recipient?: string;         // Wallet address to receive harvested rewards
}

export interface CompoundParams {
  poolId: string;
  positionId?: string;
  swapPath?: string[];        // Token swap path for reinvesting
}

export interface SwapParams {
  fromToken: string;
  toToken: string;
  amountIn: string;
  minAmountOut?: string;
  slippagePct?: number;
}
