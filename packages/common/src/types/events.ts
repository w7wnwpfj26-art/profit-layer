// ============================================
// BullMQ Event/Job Types (Shared between TS and Python)
// ============================================

// Queue names
export const QUEUES = {
  POOL_SCAN: "pool-scan",
  STRATEGY_COMPUTE: "strategy-compute",
  EXECUTE_TX: "execute-tx",
  RISK_CHECK: "risk-check",
  ALERTS: "alerts",
} as const;

// Job types
export interface PoolScanJob {
  type: "full_scan" | "incremental";
  chains?: string[];
  protocols?: string[];
  timestamp: string;
}

export interface StrategyComputeJob {
  type: "optimize" | "rebalance" | "compound_check";
  strategyId?: string;
  poolData?: {
    poolId: string;
    aprTotal: number;
    tvlUsd: number;
    chain: string;
    protocolId: string;
    healthScore?: number;
  }[];
  timestamp: string;
}

export interface ExecuteTxJob {
  signalId: string;
  strategyId: string;
  action: string;
  poolId: string;
  chain: string;
  protocolId: string;
  amountUsd: number;
  params: Record<string, unknown>;
  timestamp: string;
}

export interface RiskCheckJob {
  type: "position_check" | "protocol_check" | "anomaly_scan";
  positionId?: string;
  protocolId?: string;
  timestamp: string;
}

export interface AlertJob {
  severity: "info" | "warning" | "error" | "critical";
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}
