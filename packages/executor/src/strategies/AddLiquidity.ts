// ============================================
// Add Liquidity Strategy Action
// ============================================

import { createLogger, type TxType, TxType as TxTypeEnum } from "@profitlayer/common";
import type { IProtocolAdapter } from "@profitlayer/adapters";
import type { TxExecutor } from "../transaction/TxExecutor.js";
import { DEFAULT_SLIPPAGE_PCT } from "../constants.js";

const logger = createLogger("executor:add-liquidity");

export interface AddLiquidityParams {
  poolId: string;
  tokens: { address: string; amount: string }[];
  amountUsd: number;
  slippagePct?: number;
}

/**
 * Execute add-liquidity via protocol adapter + tx executor.
 */
export async function executeAddLiquidity(
  adapter: IProtocolAdapter,
  executor: TxExecutor,
  params: AddLiquidityParams
): Promise<string> {
  logger.info("Executing add liquidity", {
    protocol: adapter.protocolId,
    chain: adapter.chain,
    poolId: params.poolId,
    amountUsd: params.amountUsd,
  });

  // 1. Build deposit payload via adapter
  const payload = await adapter.deposit({
    poolId: params.poolId,
    tokens: params.tokens,
    slippagePct: params.slippagePct ?? DEFAULT_SLIPPAGE_PCT,
  });

  // 2. Execute via TxExecutor (includes simulation + safety checks)
  const record = await executor.execute(
    payload,
    TxTypeEnum.DEPOSIT,
    params.amountUsd,
    { poolId: params.poolId, protocol: adapter.protocolId }
  );

  return record.txHash;
}
