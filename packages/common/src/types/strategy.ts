// ============================================
// Strategy Types
// ============================================

export enum StrategyType {
  YIELD_FARMING = "yield_farming",
  LENDING_ARB = "lending_arb",
  CROSS_DEX_ARB = "cross_dex_arb",
  LIQUID_STAKING = "liquid_staking",
  AUTO_COMPOUND = "auto_compound",
}

export interface Strategy {
  strategyId: string;
  name: string;
  strategyType: StrategyType;
  description?: string;
  config: StrategyConfig;
  isActive: boolean;
  totalAllocatedUsd: number;
  totalPnlUsd: number;
}

export interface StrategyConfig {
  // Target allocation
  maxAllocationUsd: number;
  minAprThreshold: number;       // Minimum APR to enter (%)
  maxRiskScore: number;          // Maximum acceptable risk (0-100)

  // Execution
  compoundIntervalMs: number;    // How often to compound (ms)
  rebalanceThresholdPct: number; // Rebalance when deviation exceeds this %

  // Risk
  stopLossPct: number;           // Stop loss trigger (%)
  maxSlippagePct: number;        // Max acceptable slippage (%)
  maxSingleTxUsd: number;       // Per-transaction limit

  // Filters
  allowedChains?: string[];
  allowedProtocols?: string[];
  excludedProtocols?: string[];
  minTvlUsd?: number;
}

export interface StrategySignal {
  signalId: string;
  strategyId: string;
  action: StrategyAction;
  poolId: string;
  chain: string;
  protocolId: string;
  amountUsd: number;
  reason: string;
  confidence: number;            // 0-1
  riskScore: number;             // 0-100
  expectedApr: number;
  timestamp: Date;
}

export enum StrategyAction {
  ENTER = "enter",               // Open new position
  EXIT = "exit",                 // Close position
  COMPOUND = "compound",         // Harvest and re-invest
  REBALANCE = "rebalance",       // Adjust position
  INCREASE = "increase",         // Add to position
  DECREASE = "decrease",         // Reduce position
}

export interface StrategySnapshot {
  time: Date;
  strategyId: string;
  allocatedUsd: number;
  pnlUsd: number;
  aprRealized: number;
  riskScore: number;
  positionsCount: number;
}
