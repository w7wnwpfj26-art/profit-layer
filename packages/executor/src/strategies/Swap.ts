// ============================================
// Token Swap Strategy Action
// ============================================

import { createLogger, TxType, type Chain } from "@profitlayer/common";
import type { ILPAdapter } from "@profitlayer/adapters";
import type { TxExecutor } from "../transaction/TxExecutor.js";

const logger = createLogger("executor:swap");

export interface SwapExecutionParams {
  poolId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  minAmountOut: string;
  amountUsd: number;
}

export async function executeSwap(
  adapter: ILPAdapter,
  executor: TxExecutor,
  params: SwapExecutionParams
): Promise<string> {
  logger.info("Executing swap", {
    protocol: adapter.protocolId,
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    amountUsd: params.amountUsd,
  });

  const payload = await adapter.swap({
    poolId: params.poolId,
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    amountIn: params.amountIn,
    minAmountOut: params.minAmountOut,
  });

  const record = await executor.execute(
    payload,
    TxType.SWAP,
    params.amountUsd,
    { tokenIn: params.tokenIn, tokenOut: params.tokenOut }
  );

  return record.txHash;
}
