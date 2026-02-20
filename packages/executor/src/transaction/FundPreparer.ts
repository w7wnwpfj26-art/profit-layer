// ============================================
// Fund Preparer - Auto-wrap ETH & swap to target tokens
//
// Before depositing into a pool, ensure the wallet has
// the required tokens. If only native ETH/BNB is available:
// 1. Wrap part of native token to WETH/WBNB
// 2. Swap WETH to target token via DEX aggregator (if needed)
// ============================================

import {
  Chain,
  ChainType,
  CHAIN_TYPE_MAP,
  TxType,
  type TransactionPayload,
  createLogger,
  CHAIN_CONFIGS,
} from "@profitlayer/common";
import { encodeFunctionData, createPublicClient, http } from "viem";
import { mainnet, arbitrum, polygon, bsc, base, optimism, avalanche } from "viem/chains";
import type { TxExecutor } from "./TxExecutor.js";

const CHAIN_TO_VIEM: Record<string, any> = {
  [Chain.ETHEREUM]: mainnet,
  [Chain.ARBITRUM]: arbitrum,
  [Chain.POLYGON]: polygon,
  [Chain.BSC]: bsc,
  [Chain.BASE]: base,
  [Chain.OPTIMISM]: optimism,
  [Chain.AVALANCHE]: avalanche,
};

const logger = createLogger("executor:fund-preparer");

// WETH/WBNB addresses per chain
const WRAPPED_NATIVE: Record<string, string> = {
  [Chain.ETHEREUM]: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  [Chain.ARBITRUM]: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  [Chain.BASE]: "0x4200000000000000000000000000000000000006",
  [Chain.OPTIMISM]: "0x4200000000000000000000000000000000000006",
  [Chain.POLYGON]: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // WPOL
  [Chain.BSC]: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
  [Chain.AVALANCHE]: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", // WAVAX
};

// Minimal WETH ABI: deposit() payable
const WETH_ABI = [
  {
    name: "deposit",
    type: "function",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
] as const;

/**
 * Build a wrap-native-token transaction (ETH → WETH, BNB → WBNB, etc.)
 */
export function buildWrapPayload(
  chain: Chain,
  amountWei: bigint,
): TransactionPayload | null {
  const wethAddress = WRAPPED_NATIVE[chain];
  if (!wethAddress) return null;

  const data = encodeFunctionData({
    abi: WETH_ABI,
    functionName: "deposit",
  });

  return {
    chain,
    to: wethAddress,
    data,
    value: amountWei.toString(),
  };
}

/**
 * Check if a token address is the wrapped native token for this chain.
 */
export function isWrappedNative(chain: Chain, tokenAddress: string): boolean {
  const weth = WRAPPED_NATIVE[chain];
  if (!weth) return false;
  return weth.toLowerCase() === tokenAddress.toLowerCase();
}

/**
 * Get the wrapped native token address for a chain.
 */
export function getWrappedNativeAddress(chain: Chain): string | null {
  return WRAPPED_NATIVE[chain] || null;
}

/**
 * Prepare funds for a deposit: wrap native token if needed.
 *
 * Logic:
 * - For each token the pool needs:
 *   - If it's WETH/WBNB: wrap native ETH/BNB
 *   - If it's another token: we'd need a swap (handled elsewhere)
 *
 * @returns Updated token list with amounts adjusted
 */
export async function prepareFundsForDeposit(
  executor: TxExecutor,
  chain: Chain,
  tokens: Array<{ address: string; amount: string }>,
  amountUsd: number,
  walletAddress?: string,
): Promise<Array<{ address: string; amount: string }>> {
  const chainType = CHAIN_TYPE_MAP[chain];
  if (chainType !== ChainType.EVM) return tokens;

  const wethAddress = WRAPPED_NATIVE[chain];
  if (!wethAddress) return tokens;

  const result: Array<{ address: string; amount: string }> = [];

  for (const token of tokens) {
    if (!token.address || token.address === "0x") {
      result.push(token);
      continue;
    }

    // If this token IS the wrapped native token, wrap ETH for it
    if (isWrappedNative(chain, token.address)) {
      const amountWei = BigInt(token.amount);
      if (amountWei > 0n) {
        // 预检查：确保钱包有足够余额（含 gas），避免 simulation 失败
        if (walletAddress) {
          try {
            const viemChain = CHAIN_TO_VIEM[chain];
            const rpcUrl = CHAIN_CONFIGS[chain]?.rpcUrl;
            if (viemChain && rpcUrl) {
              const client = createPublicClient({
                chain: viemChain,
                transport: http(rpcUrl),
              });
              const [balance, gasPrice] = await Promise.all([
                client.getBalance({ address: walletAddress as `0x${string}` }).catch(() => 0n),
                client.getGasPrice().catch(() => 0n),
              ]);
              const gasReserve = gasPrice * 300000n; // 预留 ~30万 gas
              if (balance < amountWei + gasReserve) {
                logger.warn(`余额不足: 需要 ${amountWei} + gas ${gasReserve}，实际 ${balance}`, { chain });
                result.push(token);
                continue;
              }
            }
          } catch {
            // 预检查失败则继续尝试 wrap（由 TxExecutor 模拟兜底）
          }
        }

        logger.info(`Wrapping native token → ${wethAddress} on ${chain}`, {
          amountWei: amountWei.toString(),
        });

        const wrapPayload = buildWrapPayload(chain, amountWei);
        if (wrapPayload) {
          try {
            await executor.execute(
              wrapPayload,
              TxType.SWAP, // categorize as swap
              0,
              { action: "auto_wrap_native", chain },
            );
            logger.info(`Wrapped native token successfully on ${chain}`);
          } catch (err) {
            logger.error(`Failed to wrap native token on ${chain}`, {
              error: (err as Error).message,
            });
            throw err;
          }
        }
      }
      result.push(token);
    } else {
      // For non-WETH tokens, the caller should use DEX aggregator to swap
      // For now, pass through (the deposit will fail if no balance)
      result.push(token);
    }
  }

  return result;
}
