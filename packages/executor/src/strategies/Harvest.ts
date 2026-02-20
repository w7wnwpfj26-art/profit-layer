// ============================================
// Harvest Rewards Strategy Action
// ============================================

import { createLogger, TxType } from "@defi-yield/common";
import type { IProtocolAdapter } from "@defi-yield/adapters";
import type { TxExecutor } from "../transaction/TxExecutor.js";

const logger = createLogger("executor:harvest");

export async function executeHarvest(
  adapter: IProtocolAdapter,
  executor: TxExecutor,
  poolId: string,
  estimatedRewardUsd: number
): Promise<string> {
  logger.info("Executing harvest", {
    protocol: adapter.protocolId,
    poolId,
    estimatedRewardUsd,
  });

  const payload = await adapter.harvest({ poolId });

  const record = await executor.execute(
    payload,
    TxType.HARVEST,
    estimatedRewardUsd,
    { poolId, protocol: adapter.protocolId }
  );

  return record.txHash;
}
