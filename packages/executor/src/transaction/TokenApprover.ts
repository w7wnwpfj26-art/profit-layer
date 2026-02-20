// ============================================
// ERC20 Token Approval Helper
//
// Before depositing into any DEX/lending protocol,
// each token must approve the protocol contract to
// spend the wallet's tokens.
// ============================================

import {
  Chain,
  ChainType,
  CHAIN_TYPE_MAP,
  TxType,
  type TransactionPayload,
  createLogger,
} from "@profitlayer/common";
import { encodeFunctionData, erc20Abi, maxUint256 } from "viem";
import type { TxExecutor } from "./TxExecutor.js";

const logger = createLogger("executor:approver");

/**
 * Build an ERC20 approve transaction payload.
 */
export function buildApprovePayload(
  chain: Chain,
  tokenAddress: string,
  spenderAddress: string,
  amount: bigint = maxUint256,
): TransactionPayload {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [spenderAddress as `0x${string}`, amount],
  });

  return {
    chain,
    to: tokenAddress,
    data,
    value: "0",
  };
}

/**
 * Execute approve transactions for all tokens that need approval
 * before a deposit/swap operation.
 *
 * @param executor - Transaction executor
 * @param chain - Target chain
 * @param tokens - Array of {address, amount} to approve
 * @param spenderContract - The contract that will spend tokens (e.g. Uniswap router)
 * @returns Number of approvals executed
 */
export async function approveTokensIfNeeded(
  executor: TxExecutor,
  chain: Chain,
  tokens: Array<{ address: string; amount: string }>,
  spenderContract: string,
): Promise<number> {
  const chainType = CHAIN_TYPE_MAP[chain];
  if (chainType !== ChainType.EVM) {
    // Aptos/Solana don't use ERC20 approve pattern
    return 0;
  }

  let approvals = 0;

  for (const token of tokens) {
    if (!token.address || token.address === "0x" || token.address === "0x0000000000000000000000000000000000000000") {
      continue; // Skip native token (ETH) or invalid addresses
    }

    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`Approving ${token.address} for ${spenderContract} on ${chain} (attempt ${attempt}/${maxRetries})`);

        const payload = buildApprovePayload(
          chain,
          token.address,
          spenderContract,
          maxUint256, // Approve max to avoid repeated approvals
        );

        await executor.execute(
          payload,
          TxType.APPROVE,
          0, // Approve has no USD value
          { action: "auto_approve", token: token.address, spender: spenderContract },
        );

        approvals++;
        logger.info(`Approved ${token.address} successfully`);
        break;
      } catch (err) {
        const errMsg = (err as Error).message;
        logger.error(`Failed to approve ${token.address}`, { error: errMsg, attempt });
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 2000)); // 2s 后重试
        } else {
          throw err;
        }
      }
    }
  }

  return approvals;
}
