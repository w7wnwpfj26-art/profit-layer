// ============================================
// Protocol Adapter Base Interface
// ============================================

import type {
  Chain,
  ProtocolCategory,
  Pool,
  APRBreakdown,
  Position,
  TransactionPayload,
  DepositParams,
  WithdrawParams,
  HarvestParams,
  CompoundParams,
} from "@profitlayer/common";

/**
 * Base interface for all DeFi protocol adapters.
 * Every protocol (Uniswap, Aave, Thala, etc.) must implement this interface.
 *
 * Adding a new protocol:
 * 1. Create a new folder under the appropriate chain directory (evm/, aptos/, solana/)
 * 2. Implement this interface
 * 3. Register the adapter via AdapterRegistry.register()
 */
export interface IProtocolAdapter {
  /** Unique identifier, e.g. "uniswap-v3" */
  readonly protocolId: string;

  /** Display name, e.g. "Uniswap V3" */
  readonly name: string;

  /** Target blockchain */
  readonly chain: Chain;

  /** Protocol category */
  readonly category: ProtocolCategory;

  /** Protocol website */
  readonly websiteUrl: string;

  // ---- Initialization ----

  /** Initialize the adapter (RPC connections, etc.) */
  initialize(): Promise<void>;

  /** Check if adapter is ready */
  isReady(): boolean;

  // ---- Read Operations ----

  /** Get all available pools for this protocol */
  getPools(): Promise<Pool[]>;

  /** Get detailed APR breakdown for a specific pool */
  getPoolAPR(poolId: string): Promise<APRBreakdown>;

  /** Get user's position in a specific pool */
  getPosition(walletAddress: string, poolId: string): Promise<Position | null>;

  /** Get all user positions across this protocol */
  getAllPositions(walletAddress: string): Promise<Position[]>;

  /** Get pending rewards for a position */
  getPendingRewards(walletAddress: string, poolId: string): Promise<{
    tokens: { address: string; symbol: string; amount: string; valueUsd: number }[];
    totalValueUsd: number;
  }>;

  // ---- Write Operations (return unsigned tx payloads) ----

  /** Build deposit/add-liquidity transaction */
  deposit(params: DepositParams): Promise<TransactionPayload>;

  /** Build withdraw/remove-liquidity transaction */
  withdraw(params: WithdrawParams): Promise<TransactionPayload>;

  /** Build harvest/claim-rewards transaction */
  harvest(params: HarvestParams): Promise<TransactionPayload>;

  /** Build compound (harvest + re-deposit) transaction(s) */
  compound(params: CompoundParams): Promise<TransactionPayload[]>;
}
