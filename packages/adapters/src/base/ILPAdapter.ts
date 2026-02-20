// ============================================
// Liquidity Pool Adapter Interface
// ============================================

import type { TransactionPayload } from "@defi-yield/common";
import type { IProtocolAdapter } from "./IProtocolAdapter.js";

export interface LPInfo {
  poolId: string;
  lpTokenAddress: string;
  token0: { address: string; symbol: string; reserve: string };
  token1: { address: string; symbol: string; reserve: string };
  totalLpSupply: string;
  fee: number;
  // For concentrated liquidity
  tickLower?: number;
  tickUpper?: number;
  currentTick?: number;
}

/**
 * Extended adapter for LP/AMM protocols (Uniswap, Thala, Raydium, etc.)
 */
export interface ILPAdapter extends IProtocolAdapter {
  /** Get detailed LP info */
  getLPInfo(poolId: string): Promise<LPInfo>;

  /** Calculate optimal token amounts for deposit */
  quoteDeposit(params: {
    poolId: string;
    amountToken0?: string;
    amountToken1?: string;
  }): Promise<{
    amountToken0: string;
    amountToken1: string;
    lpTokensExpected: string;
    priceImpactPct: number;
  }>;

  /** Calculate expected output for withdrawal */
  quoteWithdraw(params: {
    poolId: string;
    lpAmount: string;
  }): Promise<{
    amountToken0: string;
    amountToken1: string;
  }>;

  /** Build swap transaction */
  swap(params: {
    poolId: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    minAmountOut: string;
  }): Promise<TransactionPayload>;
}
