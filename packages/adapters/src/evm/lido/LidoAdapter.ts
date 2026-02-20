// ============================================
// Lido Liquid Staking Adapter
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
} from "@profitlayer/common";
import { createPublicClient, http, encodeFunctionData, type Chain as ViemChain } from "viem";
import { mainnet } from "viem/chains";
import type { IStakingAdapter, StakingInfo, StakingPosition } from "../../base/IStakingAdapter.js";

const logger = createLogger("adapters:lido");

const STETH_ADDRESS: `0x${string}` = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
const WSTETH_ADDRESS: `0x${string}` = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0";

const LIDO_ABI = [
  { inputs: [{ name: "_referral", type: "address" }], name: "submit", outputs: [{ name: "", type: "uint256" }], stateMutability: "payable", type: "function" },
] as const;

export class LidoAdapter implements IStakingAdapter {
  readonly protocolId = "lido";
  readonly name = "Lido Finance";
  readonly chain = Chain.ETHEREUM;
  readonly category = ProtocolCategory.STAKING;
  readonly websiteUrl = "https://lido.fi";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;
  private ready = false;

  async initialize(): Promise<void> {
    this.client = createPublicClient({ chain: mainnet, transport: http() });
    await this.client!.getBlockNumber();
    this.ready = true;
    logger.info("Lido adapter initialized on Ethereum");
  }

  isReady(): boolean { return this.ready; }
  async getPools(): Promise<Pool[]> { return []; }
  async getPoolAPR(_poolId: string): Promise<APRBreakdown> {
    return { base: 3.8, reward: 0, total: 3.8, components: [{ source: "eth-staking", apr: 3.8 }] };
  }
  async getPosition(walletAddress: string, poolId: string): Promise<Position | null> { return null; }
  async getAllPositions(walletAddress: string): Promise<Position[]> { return []; }
  async getPendingRewards(walletAddress: string, poolId: string) { return { tokens: [], totalValueUsd: 0 }; }

  // Staking-specific
  async getStakingInfo(): Promise<StakingInfo[]> {
    return [{
      stakingId: "eth-steth",
      asset: "ETH",
      assetSymbol: "ETH",
      liquidToken: STETH_ADDRESS,
      liquidTokenSymbol: "stETH",
      apr: 3.8,
      totalStaked: "0",
      totalStakedUsd: 14_000_000_000,
      exchangeRate: 1.0,
      minStake: "0.01",
    }];
  }

  async getStakingPosition(walletAddress: string, stakingId: string): Promise<StakingPosition | null> {
    return null;
  }

  async stake(params: { stakingId: string; amount: string }): Promise<TransactionPayload> {
    logger.info("Building Lido stake transaction", params);
    const data = encodeFunctionData({
      abi: LIDO_ABI,
      functionName: "submit",
      args: ["0x0000000000000000000000000000000000000000"],
    });
    return { chain: Chain.ETHEREUM, to: STETH_ADDRESS, data, value: params.amount };
  }

  async unstake(params: { stakingId: string; amount: string }): Promise<TransactionPayload> {
    logger.info("Building Lido unstake transaction", params);
    // Lido withdrawal queue
    return { chain: Chain.ETHEREUM, to: STETH_ADDRESS, data: "0x" };
  }

  async deposit(params: DepositParams): Promise<TransactionPayload> {
    return this.stake({ stakingId: "eth-steth", amount: params.tokens[0]?.amount || "0" });
  }
  async withdraw(params: WithdrawParams): Promise<TransactionPayload> {
    return this.unstake({ stakingId: "eth-steth", amount: params.lpAmount });
  }
  async harvest(_params: HarvestParams): Promise<TransactionPayload> {
    return { chain: Chain.ETHEREUM, to: STETH_ADDRESS, data: "0x" };
  }
  async compound(_params: CompoundParams): Promise<TransactionPayload[]> {
    return []; // stETH auto-compounds
  }
}
