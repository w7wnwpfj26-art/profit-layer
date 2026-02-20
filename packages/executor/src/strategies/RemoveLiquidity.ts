// ============================================
// Remove Liquidity Strategy Action
// ============================================

import { createLogger, TxType } from "@profitlayer/common";
import type { IProtocolAdapter } from "@profitlayer/adapters";
import type { TxExecutor } from "../transaction/TxExecutor.js";
import { DEFAULT_SLIPPAGE_PCT } from "../constants.js";

const logger = createLogger("executor:remove-liquidity");

export interface RemoveLiquidityParams {
  poolId: string;
  lpAmount: string;
  amountUsd: number;
  slippagePct?: number;
}

export async function executeRemoveLiquidity(
  adapter: IProtocolAdapter,
  executor: TxExecutor,
  params: RemoveLiquidityParams
): Promise<string> {
  logger.info("Executing remove liquidity", {
    protocol: adapter.protocolId,
    poolId: params.poolId,
  });

  const payload = await adapter.withdraw({
    poolId: params.poolId,
    lpAmount: params.lpAmount,
    slippagePct: params.slippagePct ?? DEFAULT_SLIPPAGE_PCT,
  });

  const record = await executor.execute(
    payload,
    TxType.WITHDRAW,
    params.amountUsd,
    { poolId: params.poolId, protocol: adapter.protocolId }
  );

  return record.txHash;
}
