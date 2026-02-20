// ============================================
// Auto-Compound Strategy Action
// ============================================

import { createLogger, TxType } from "@defi-yield/common";
import type { IProtocolAdapter } from "@defi-yield/adapters";
import type { TxExecutor } from "../transaction/TxExecutor.js";

const logger = createLogger("executor:compound");

export async function executeCompound(
  adapter: IProtocolAdapter,
  executor: TxExecutor,
  poolId: string,
  estimatedValueUsd: number
): Promise<string[]> {
  logger.info("Executing compound", {
    protocol: adapter.protocolId,
    poolId,
    estimatedValueUsd,
  });

  // Compound returns multiple txs: harvest + re-deposit
  const payloads = await adapter.compound({ poolId });

  const hashes: string[] = [];
  for (const payload of payloads) {
    const record = await executor.execute(
      payload,
      TxType.COMPOUND,
      estimatedValueUsd / payloads.length,
      { poolId, protocol: adapter.protocolId, step: hashes.length + 1 }
    );
    hashes.push(record.txHash);
  }

  return hashes;
}
