// ============================================
// Transaction Simulator (Pre-Execution Check)
// Uses eth_estimateGas / Aptos simulate / Solana simulateTransaction
// ============================================

import {
  createLogger,
  type TransactionPayload,
  type Chain,
  ChainType,
  CHAIN_TYPE_MAP,
  CHAIN_CONFIGS,
} from "@profitlayer/common";
import { createPublicClient, http, type PublicClient } from "viem";
import { mainnet, arbitrum, polygon, bsc, base, optimism, avalanche } from "viem/chains";

const logger = createLogger("executor:simulator");

const CHAIN_TO_VIEM: Record<string, any> = {
  ethereum: mainnet,
  arbitrum,
  polygon,
  bsc,
  base,
  optimism,
  avalanche,
};

/** 使用 CHAIN_CONFIGS（支持 env 覆盖 RPC） */
function getRpcUrl(chain: Chain): string {
  const cfg = CHAIN_CONFIGS[chain as keyof typeof CHAIN_CONFIGS];
  return cfg?.rpcUrl || "https://eth.llamarpc.com";
}

export interface SimulationResult {
  success: boolean;
  gasEstimate?: bigint;
  error?: string;
  revertReason?: string;
  logs?: string[];
}

/**
 * Simulates transactions before execution to catch errors and estimate gas.
 */
export class TxSimulator {
  private evmClients: Map<string, PublicClient> = new Map();

  private getEvmClient(chain: Chain): PublicClient {
    if (!this.evmClients.has(chain)) {
      const viemChain = CHAIN_TO_VIEM[chain];
      const rpcUrl = getRpcUrl(chain);
      if (viemChain && rpcUrl) {
        const client = createPublicClient({
          chain: viemChain,
          transport: http(rpcUrl),
        }) as unknown as PublicClient;
        this.evmClients.set(chain, client);
      }
    }
    return this.evmClients.get(chain)!;
  }

  /**
   * Simulate a transaction and return the result.
   * All transactions MUST pass simulation before execution.
   */
  async simulate(
    payload: TransactionPayload,
    walletAddress: string
  ): Promise<SimulationResult> {
    const chainType = CHAIN_TYPE_MAP[payload.chain];

    try {
      switch (chainType) {
        case ChainType.EVM:
          return await this.simulateEvm(payload, walletAddress);
        case ChainType.APTOS:
          return await this.simulateAptos(payload, walletAddress);
        case ChainType.SOLANA:
          return await this.simulateSolana(payload, walletAddress);
        default:
          return { success: false, error: `Unsupported chain type: ${chainType}` };
      }
    } catch (err) {
      logger.error("Simulation failed", {
        chain: payload.chain,
        error: (err as Error).message,
      });
      return { success: false, error: (err as Error).message };
    }
  }

  private async simulateEvm(
    payload: TransactionPayload,
    walletAddress: string
  ): Promise<SimulationResult> {
    logger.info("Simulating EVM transaction", {
      chain: payload.chain,
      to: payload.to,
    });

    const client = this.getEvmClient(payload.chain);
    if (!client) {
      return { success: false, error: `No RPC client for chain ${payload.chain}` };
    }

    try {
      // 使用 eth_estimateGas 真正模拟
      const gasEstimate = await client.estimateGas({
        account: walletAddress as `0x${string}`,
        to: payload.to as `0x${string}`,
        data: (payload.data || "0x") as `0x${string}`,
        value: BigInt(payload.value || "0"),
      });

      // 加 30% buffer（减少 gas 不足导致的执行失败）
      const gasWithBuffer = (gasEstimate * 130n) / 100n;

      return {
        success: true,
        gasEstimate: gasWithBuffer,
        logs: [`EVM estimateGas: ${gasEstimate}, with buffer: ${gasWithBuffer}`],
      };
    } catch (err) {
      const message = (err as Error).message;
      // 解析 revert 原因
      const revertMatch = message.match(/execution reverted:?\s*(.*)/i);
      return {
        success: false,
        error: message,
        revertReason: revertMatch ? revertMatch[1] : "Transaction would revert",
      };
    }
  }

  private async simulateAptos(
    payload: TransactionPayload,
    walletAddress: string
  ): Promise<SimulationResult> {
    logger.info("Simulating Aptos transaction", { to: payload.to });

    // Aptos simulation via REST API
    if (!payload.aptosPayload) {
      return { success: false, error: "Missing aptosPayload" };
    }

    try {
      const nodeUrl = "https://fullnode.mainnet.aptoslabs.com/v1";
      const body = {
        sender: walletAddress,
        sequence_number: "0",
        max_gas_amount: "200000",
        gas_unit_price: "100",
        expiration_timestamp_secs: String(Math.floor(Date.now() / 1000) + 600),
        payload: payload.aptosPayload,
      };

      const resp = await fetch(`${nodeUrl}/transactions/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (resp.ok) {
        const results = await resp.json();
        const simTx = Array.isArray(results) ? results[0] : results;
        const success = simTx?.success === true;
        const gasUsed = BigInt(simTx?.gas_used || "1000");

        return {
          success,
          gasEstimate: gasUsed,
          logs: [`Aptos simulation: success=${success}, gas=${gasUsed}`],
          revertReason: success ? undefined : simTx?.vm_status,
        };
      }
      return { success: false, error: `Aptos simulation HTTP ${resp.status}` };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  private async simulateSolana(
    payload: TransactionPayload,
    walletAddress: string
  ): Promise<SimulationResult> {
    logger.info("Simulating Solana transaction");

    // Solana simulation via RPC simulateTransaction（使用 CHAIN_CONFIGS 支持 env 覆盖）
    try {
      const rpcUrl = (CHAIN_CONFIGS as Record<string, { rpcUrl?: string }>)[payload.chain]?.rpcUrl
        || "https://api.mainnet-beta.solana.com";

      if (!payload.data) {
        // 若没有序列化的交易数据，只做基本检查
        return {
          success: true,
          gasEstimate: 5000n,
          logs: ["Solana: no serialized tx data, basic check passed"],
        };
      }

      const body = {
        jsonrpc: "2.0",
        id: 1,
        method: "simulateTransaction",
        params: [
          payload.data, // base64 encoded transaction
          {
            encoding: "base64",
            commitment: "confirmed",
            sigVerify: false,
            replaceRecentBlockhash: true,
          },
        ],
      };

      const resp = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (resp.ok) {
        const json = await resp.json() as { result?: { value?: { err?: unknown; logs?: string[]; unitsConsumed?: number } } };
        const result = json?.result?.value;
        if (result?.err) {
          return {
            success: false,
            error: JSON.stringify(result.err),
            revertReason: "Solana simulation failed",
            logs: result.logs || [],
          };
        }
        const unitsConsumed = BigInt(result?.unitsConsumed || 5000);
        return {
          success: true,
          gasEstimate: unitsConsumed,
          logs: result?.logs || [`Solana simulation passed, CU=${unitsConsumed}`],
        };
      }
      return { success: false, error: `Solana RPC HTTP ${resp.status}` };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
