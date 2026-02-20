// ============================================
// Lending Protocol Adapter Interface
// ============================================

import type { TransactionPayload } from "@profitlayer/common";
import type { IProtocolAdapter } from "./IProtocolAdapter.js";

export interface LendingMarket {
  marketId: string;
  asset: string;
  assetSymbol: string;
  supplyApr: number;
  borrowApr: number;
  totalSupplyUsd: number;
  totalBorrowUsd: number;
  utilization: number;
  ltv: number;               // Loan-to-value ratio
  liquidationThreshold: number;
  isCollateral: boolean;
}

export interface BorrowPosition {
  marketId: string;
  asset: string;
  suppliedAmount: string;
  suppliedValueUsd: number;
  borrowedAmount: string;
  borrowedValueUsd: number;
  healthFactor: number;
  netApr: number;
}

/**
 * Extended adapter for lending protocols (Aave, Compound, etc.)
 */
export interface ILendingAdapter extends IProtocolAdapter {
  /** Get all lending markets */
  getMarkets(): Promise<LendingMarket[]>;

  /** Get user's borrow/supply positions */
  getBorrowPositions(walletAddress: string): Promise<BorrowPosition[]>;

  /** Build supply/lend transaction */
  supply(params: {
    marketId: string;
    asset: string;
    amount: string;
  }): Promise<TransactionPayload>;

  /** Build borrow transaction */
  borrow(params: {
    marketId: string;
    asset: string;
    amount: string;
  }): Promise<TransactionPayload>;

  /** Build repay transaction */
  repay(params: {
    marketId: string;
    asset: string;
    amount: string;
  }): Promise<TransactionPayload>;
}
