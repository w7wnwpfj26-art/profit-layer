// ============================================
// Protocol Adapter Registry
// ============================================

import type { Chain, ProtocolCategory } from "@defi-yield/common";
import { createLogger } from "@defi-yield/common";
import type { IProtocolAdapter } from "./IProtocolAdapter.js";

const logger = createLogger("adapters:registry");

/**
 * Central registry for all protocol adapters.
 * Provides lookup by protocol ID, chain, or category.
 */
export class AdapterRegistry {
  private adapters = new Map<string, IProtocolAdapter>();

  /** Register an adapter */
  register(adapter: IProtocolAdapter): void {
    const key = this.makeKey(adapter.protocolId, adapter.chain);

    if (this.adapters.has(key)) {
      logger.warn(`Adapter already registered: ${key}, replacing`);
    }

    this.adapters.set(key, adapter);
    logger.info(`Registered adapter: ${adapter.name} on ${adapter.chain}`, {
      protocolId: adapter.protocolId,
      chain: adapter.chain,
      category: adapter.category,
    });
  }

  /** Get a specific adapter */
  get(protocolId: string, chain: Chain): IProtocolAdapter | undefined {
    return this.adapters.get(this.makeKey(protocolId, chain));
  }

  /** Get all adapters for a chain */
  getByChain(chain: Chain): IProtocolAdapter[] {
    return Array.from(this.adapters.values()).filter((a) => a.chain === chain);
  }

  /** Get all adapters for a category */
  getByCategory(category: ProtocolCategory): IProtocolAdapter[] {
    return Array.from(this.adapters.values()).filter(
      (a) => a.category === category
    );
  }

  /** Get all registered adapters */
  getAll(): IProtocolAdapter[] {
    return Array.from(this.adapters.values());
  }

  /** Get list of registered protocol IDs */
  listProtocols(): { protocolId: string; chain: Chain; name: string }[] {
    return Array.from(this.adapters.values()).map((a) => ({
      protocolId: a.protocolId,
      chain: a.chain,
      name: a.name,
    }));
  }

  /** Initialize all registered adapters */
  async initializeAll(): Promise<void> {
    logger.info(`Initializing ${this.adapters.size} adapters...`);
    const results = await Promise.allSettled(
      Array.from(this.adapters.values()).map(async (adapter) => {
        try {
          await adapter.initialize();
          logger.info(`Adapter initialized: ${adapter.name}`);
        } catch (err) {
          logger.error(`Failed to initialize adapter: ${adapter.name}`, {
            error: (err as Error).message,
          });
          throw err;
        }
      })
    );

    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      logger.warn(`${failed} adapter(s) failed to initialize`);
    }
  }

  /** Count registered adapters */
  get size(): number {
    return this.adapters.size;
  }

  private makeKey(protocolId: string, chain: Chain): string {
    return `${protocolId}:${chain}`;
  }
}

// Singleton instance
export const adapterRegistry = new AdapterRegistry();
