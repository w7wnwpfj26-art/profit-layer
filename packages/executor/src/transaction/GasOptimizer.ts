// ============================================
// Gas Optimization Engine
// ============================================

import { createLogger, type Chain, ChainType, CHAIN_TYPE_MAP } from "@defi-yield/common";
import { CHAIN_CONFIGS } from "@defi-yield/common";
import { getGasMultiplierForAggregator } from "../config/aggregatorFeeConfig.js";
import { createPublicClient, http, formatGwei, type Chain as ViemChain } from "viem";

const logger = createLogger("executor:gas");

export interface GasEstimate {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  estimatedCostWei: bigint;
  estimatedCostUsd: number;
  recommendation: "execute" | "wait" | "urgent";
}

/**
 * Optimizes gas costs for EVM transactions.
 * Determines optimal timing and gas prices.
 */
export class GasOptimizer {
  // Historical gas price thresholds (in gwei) for timing optimization
  private readonly GAS_THRESHOLDS: Record<string, { low: number; medium: number; high: number }> = {
    ethereum: { low: 15, medium: 30, high: 60 },
    arbitrum: { low: 0.01, medium: 0.1, high: 0.5 },
    polygon: { low: 30, medium: 50, high: 100 },
    base: { low: 0.005, medium: 0.05, high: 0.2 },
    optimism: { low: 0.005, medium: 0.05, high: 0.2 },
    bsc: { low: 1, medium: 3, high: 5 },
    avalanche: { low: 25, medium: 30, high: 50 },
  };

  /**
   * Get optimized gas parameters for an EVM transaction.
   * @param aggregator 聚合器来源，用于应用 AGGREGATOR_GAS_MULTIPLIER（如 uniswap-v3 加缓冲）
   */
  async getOptimalGas(
    chain: Chain,
    gasLimit: bigint,
    nativeTokenPriceUsd: number,
    aggregator?: string
  ): Promise<GasEstimate> {
    const chainType = CHAIN_TYPE_MAP[chain];
    if (chainType !== ChainType.EVM) {
      return {
        maxFeePerGas: 0n,
        maxPriorityFeePerGas: 0n,
        estimatedCostWei: 0n,
        estimatedCostUsd: 0,
        recommendation: "execute",
      };
    }

    const config = CHAIN_CONFIGS[chain];

    try {
      const client = createPublicClient({
        transport: http(config.rpcUrl),
      });

      // Get current gas price
      const gasPrice = await client.getGasPrice();
      const gasPriceGwei = Number(formatGwei(gasPrice));

      // Calculate costs
      const estimatedCostWei = gasPrice * gasLimit;
      const estimatedCostEth = Number(estimatedCostWei) / 1e18;
      const estimatedCostUsd = estimatedCostEth * nativeTokenPriceUsd;

      // Determine recommendation
      const thresholds = this.GAS_THRESHOLDS[chain] || { low: 10, medium: 30, high: 60 };
      let recommendation: "execute" | "wait" | "urgent";

      if (gasPriceGwei <= thresholds.low) {
        recommendation = "execute";
      } else if (gasPriceGwei <= thresholds.medium) {
        recommendation = "execute";
      } else {
        recommendation = "wait";
      }

      logger.info(`Gas estimate for ${chain}`, {
        gasPriceGwei,
        estimatedCostUsd: estimatedCostUsd.toFixed(4),
        recommendation,
      });

      // Use EIP-1559 style pricing
      let maxPriorityFeePerGas = gasPrice / 10n; // 10% tip
      let maxFeePerGas = gasPrice + maxPriorityFeePerGas;
      const multiplier = getGasMultiplierForAggregator(aggregator ?? "");
      if (multiplier !== 1) {
        maxPriorityFeePerGas = (maxPriorityFeePerGas * BigInt(Math.round(multiplier * 100))) / 100n;
        maxFeePerGas = (maxFeePerGas * BigInt(Math.round(multiplier * 100))) / 100n;
      }

      return {
        maxFeePerGas,
        maxPriorityFeePerGas,
        estimatedCostWei: maxFeePerGas * gasLimit,
        estimatedCostUsd,
        recommendation,
      };
    } catch (err) {
      logger.error(`Failed to get gas for ${chain}`, { error: (err as Error).message });
      // 返回保守估算避免 0n 导致链上失败
      const fallbackGwei = BigInt(
        chain === "ethereum" ? 30 : chain === "base" || chain === "arbitrum" ? 1 : 10
      );
      let fallbackWei = fallbackGwei * 10n ** 9n;
      const multiplier = getGasMultiplierForAggregator(aggregator ?? "");
      if (multiplier !== 1) {
        fallbackWei = (fallbackWei * BigInt(Math.round(multiplier * 100))) / 100n;
      }
      return {
        maxFeePerGas: fallbackWei,
        maxPriorityFeePerGas: fallbackWei / 10n,
        estimatedCostWei: fallbackWei * gasLimit,
        estimatedCostUsd: 0,
        recommendation: "wait",
      };
    }
  }
}
