// ============================================
// Rebalance Strategy Action
// ============================================

import { createLogger, TxType } from "@profitlayer/common";
import type { IProtocolAdapter } from "@profitlayer/adapters";
import { DEFAULT_SLIPPAGE_PCT } from "../constants.js";
import type { TxExecutor } from "../transaction/TxExecutor.js";

const logger = createLogger("executor:rebalance");

export interface RebalanceParams {
  fromPoolId: string;
  toPoolId: string;
  fromAdapter: IProtocolAdapter;
  toAdapter: IProtocolAdapter;
  amountUsd: number;
  lpAmount: string;
}

/**
 * Rebalance: withdraw from one pool, deposit into another.
 */
export async function executeRebalance(
  executor: TxExecutor,
  params: RebalanceParams
): Promise<{ withdrawHash: string; depositHash: string }> {
  logger.info("Executing rebalance", {
    from: `${params.fromAdapter.protocolId}:${params.fromPoolId}`,
    to: `${params.toAdapter.protocolId}:${params.toPoolId}`,
    amountUsd: params.amountUsd,
  });

  // Step 1: Withdraw from source pool
  const withdrawPayload = await params.fromAdapter.withdraw({
    poolId: params.fromPoolId,
    lpAmount: params.lpAmount,
    slippagePct: DEFAULT_SLIPPAGE_PCT,
  });

  const withdrawRecord = await executor.execute(
    withdrawPayload,
    TxType.WITHDRAW,
    params.amountUsd,
    { action: "rebalance_withdraw", poolId: params.fromPoolId }
  );

  // Step 2: Deposit into target pool
  // In production: wait for withdraw confirmation, get output amounts, then deposit
  const depositPayload = await params.toAdapter.deposit({
    poolId: params.toPoolId,
    tokens: [], // Would come from withdraw output
    slippagePct: DEFAULT_SLIPPAGE_PCT,
  });

  const depositRecord = await executor.execute(
    depositPayload,
    TxType.DEPOSIT,
    params.amountUsd,
    { action: "rebalance_deposit", poolId: params.toPoolId }
  );

  return {
    withdrawHash: withdrawRecord.txHash,
    depositHash: depositRecord.txHash,
  };
}
