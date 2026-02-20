// ============================================
// Protocol & Pool Types
// ============================================

import { Chain } from "./chain.js";

export enum ProtocolCategory {
  DEX = "dex",
  LENDING = "lending",
  STAKING = "staking",
  YIELD = "yield",
  BRIDGE = "bridge",
  DERIVATIVES = "derivatives",
}

export interface Protocol {
  protocolId: string;
  name: string;
  category: ProtocolCategory;
  chain: Chain;
  websiteUrl?: string;
  logoUrl?: string;
  tvlUsd: number;
  riskScore?: number;
  isActive: boolean;
  metadata?: Record<string, unknown>;
}

export interface Token {
  address: string;
  symbol: string;
  decimals: number;
  name?: string;
  logoUrl?: string;
  priceUsd?: number;
}

export enum PoolType {
  WEIGHTED = "weighted",
  STABLE = "stable",
  CONCENTRATED = "concentrated",
  VARIABLE = "variable",    // Lending variable rate
  FIXED = "fixed",          // Lending fixed rate
}

export interface Pool {
  poolId: string;
  protocolId: string;
  chain: Chain;
  symbol: string;
  tokens: Token[];
  poolType?: PoolType;
  tvlUsd: number;
  aprBase: number;         // Base APR %
  aprReward: number;       // Reward/incentive APR %
  aprTotal: number;        // Total APR %
  volume24hUsd: number;
  feeTier?: number;
  isActive: boolean;
  healthScore?: number;    // 单池健康分 (0-100)
  metadata?: Record<string, unknown>;
  lastScannedAt?: Date;
}

export interface APRBreakdown {
  base: number;            // Fee-based APR
  reward: number;          // Token reward APR
  total: number;           // Combined APR
  components: {
    source: string;        // e.g. "trading-fees", "THL-rewards", "APT-rewards"
    apr: number;
  }[];
}

export interface Position {
  positionId: string;
  poolId: string;
  walletAddress: string;
  chain: Chain;
  strategyId?: string;
  amountToken0: number;
  amountToken1: number;
  valueUsd: number;
  entryPriceToken0?: number;
  entryPriceToken1?: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  status: "active" | "closed" | "pending";
  openedAt: Date;
  closedAt?: Date;
}

export interface PoolSnapshot {
  time: Date;
  poolId: string;
  tvlUsd: number;
  aprBase: number;
  aprReward: number;
  aprTotal: number;
  volume24hUsd: number;
  priceToken0?: number;
  priceToken1?: number;
}
