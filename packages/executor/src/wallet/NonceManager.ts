// ============================================
// EVM Nonce Manager
// ============================================

import { createLogger } from "@profitlayer/common";
import { createPublicClient, http, type Chain as ViemChain } from "viem";

const logger = createLogger("executor:nonce");

/**
 * Manages EVM transaction nonces to prevent conflicts
 * when sending multiple transactions rapidly.
 */
export class NonceManager {
  private nonces = new Map<string, number>();
  private locks = new Map<string, boolean>();

  /** Get and increment nonce for an address on a chain */
  async getNextNonce(
    address: string,
    rpcUrl: string,
    viemChain: ViemChain
  ): Promise<number> {
    const key = `${viemChain.id}:${address}`;

    // Wait for lock
    while (this.locks.get(key)) {
      await new Promise((r) => setTimeout(r, 50));
    }
    this.locks.set(key, true);

    try {
      let nonce = this.nonces.get(key);

      if (nonce === undefined) {
        // Fetch current nonce from chain
        const client = createPublicClient({
          chain: viemChain,
          transport: http(rpcUrl),
        });
        nonce = await client.getTransactionCount({ address: address as `0x${string}` });
        logger.info(`Fetched initial nonce for ${address}: ${nonce}`);
      }

      this.nonces.set(key, nonce + 1);
      return nonce;
    } finally {
      this.locks.set(key, false);
    }
  }

  /** Reset nonce (e.g., after a failed transaction) */
  resetNonce(chainId: number, address: string): void {
    const key = `${chainId}:${address}`;
    this.nonces.delete(key);
    logger.info(`Nonce reset for ${address} on chain ${chainId}`);
  }
}
