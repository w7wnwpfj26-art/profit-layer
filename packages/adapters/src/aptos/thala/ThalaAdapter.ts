// ============================================
// Thala Finance Protocol Adapter (Aptos)
// ============================================

import {
  Chain,
  ProtocolCategory,
  createLogger,
  type Pool,
  type APRBreakdown,
  type Position,
  type TransactionPayload,
  type DepositParams,
  type WithdrawParams,
  type HarvestParams,
  type CompoundParams,
} from "@defi-yield/common";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import type { ILPAdapter, LPInfo } from "../../base/ILPAdapter.js";

const logger = createLogger("adapters:thala");

// Thala contract addresses on Aptos mainnet
const THALA_RESOURCE_ADDRESS =
  "0x48271d39d0b05bd6efca2278f22277d6fcc375504f9839fd73f74ace240861af";
const THALA_V2_RESOURCE_ADDRESS =
  "0x60955b957956d79bc80b096d3e41bad525dd400d8ce957cdeb05719ed1e4fc26";

export class ThalaAdapter implements ILPAdapter {
  readonly protocolId = "thala";
  readonly name = "Thala Finance";
  readonly chain = Chain.APTOS;
  readonly category = ProtocolCategory.DEX;
  readonly websiteUrl = "https://app.thala.fi";

  private aptosClient: Aptos | null = null;
  private ready = false;

  async initialize(): Promise<void> {
    const rpcUrl = process.env.APTOS_RPC_URL || "https://fullnode.mainnet.aptoslabs.com/v1";

    this.aptosClient = new Aptos(
      new AptosConfig({
        network: Network.MAINNET,
        fullnode: rpcUrl,
      })
    );

    // Test connection
    await this.aptosClient.getLedgerInfo();
    this.ready = true;
    logger.info("Thala adapter initialized on Aptos mainnet");
  }

  isReady(): boolean {
    return this.ready;
  }

  async getPools(): Promise<Pool[]> {
    logger.info("getPools: Use DefiLlama scanner for Thala pool discovery");
    // In production, could query Thala's on-chain resources directly
    return [];
  }

  async getPoolAPR(poolId: string): Promise<APRBreakdown> {
    logger.info(`Getting APR for Thala pool ${poolId}`);
    return {
      base: 0,
      reward: 0,
      total: 0,
      components: [
        { source: "trading-fees", apr: 0 },
        { source: "THL-rewards", apr: 0 },
      ],
    };
  }

  async getPosition(walletAddress: string, poolId: string): Promise<Position | null> {
    if (!this.aptosClient) throw new Error("Not initialized");
    logger.info(`Getting position for ${walletAddress} in ${poolId}`);

    try {
      const resources = await this.aptosClient.getAccountResources({
        accountAddress: walletAddress,
      });
      // Parse LP token holdings from resources
      logger.info(`Found ${resources.length} resources for wallet`);
      return null;
    } catch (err) {
      logger.warn(`Failed to get position: ${(err as Error).message}`);
      return null;
    }
  }

  async getAllPositions(walletAddress: string): Promise<Position[]> {
    return [];
  }

  async getPendingRewards(walletAddress: string, poolId: string) {
    return { tokens: [], totalValueUsd: 0 };
  }

  async getLPInfo(poolId: string): Promise<LPInfo> {
    return {
      poolId,
      lpTokenAddress: poolId,
      token0: { address: "", symbol: "", reserve: "0" },
      token1: { address: "", symbol: "", reserve: "0" },
      totalLpSupply: "0",
      fee: 0.003,
    };
  }

  async quoteDeposit(params: { poolId: string; amountToken0?: string; amountToken1?: string }) {
    return {
      amountToken0: params.amountToken0 || "0",
      amountToken1: params.amountToken1 || "0",
      lpTokensExpected: "0",
      priceImpactPct: 0,
    };
  }

  async quoteWithdraw(params: { poolId: string; lpAmount: string }) {
    return { amountToken0: "0", amountToken1: "0" };
  }

  async swap(params: {
    poolId: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    minAmountOut: string;
  }): Promise<TransactionPayload> {
    logger.info("Building Thala swap transaction", params);

    // Use ThalaSwap router for optimal routing
    const payload = {
      function: `${THALA_V2_RESOURCE_ADDRESS}::router::swap_exact_in`,
      typeArguments: [params.tokenIn, params.tokenOut],
      functionArguments: [params.amountIn, params.minAmountOut],
    };

    return {
      chain: Chain.APTOS,
      to: THALA_V2_RESOURCE_ADDRESS,
      aptosPayload: payload,
    };
  }

  async deposit(params: DepositParams): Promise<TransactionPayload> {
    logger.info("Building Thala add_liquidity transaction", { poolId: params.poolId });

    const payload = {
      function: `${THALA_RESOURCE_ADDRESS}::weighted_pool::add_liquidity`,
      typeArguments: params.tokens.map((t) => t.address),
      functionArguments: params.tokens.map((t) => t.amount),
    };

    return {
      chain: Chain.APTOS,
      to: THALA_RESOURCE_ADDRESS,
      aptosPayload: payload,
    };
  }

  async withdraw(params: WithdrawParams): Promise<TransactionPayload> {
    logger.info("Building Thala remove_liquidity transaction", { poolId: params.poolId });

    const payload = {
      function: `${THALA_RESOURCE_ADDRESS}::weighted_pool::remove_liquidity`,
      typeArguments: [],
      functionArguments: [params.lpAmount],
    };

    return {
      chain: Chain.APTOS,
      to: THALA_RESOURCE_ADDRESS,
      aptosPayload: payload,
    };
  }

  async harvest(params: HarvestParams): Promise<TransactionPayload> {
    logger.info("Building Thala claim_rewards transaction", { poolId: params.poolId });

    const payload = {
      function: `${THALA_RESOURCE_ADDRESS}::farming::claim_rewards`,
      typeArguments: [],
      functionArguments: [params.poolId],
    };

    return {
      chain: Chain.APTOS,
      to: THALA_RESOURCE_ADDRESS,
      aptosPayload: payload,
    };
  }

  async compound(params: CompoundParams): Promise<TransactionPayload[]> {
    logger.info("Building compound transactions for Thala");
    const harvestTx = await this.harvest({ poolId: params.poolId });
    // In production: swap rewards → deposit tokens → add liquidity
    return [harvestTx];
  }
}
