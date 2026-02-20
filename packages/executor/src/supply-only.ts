// 只执行 Supply 步骤
import { Chain, TxType, createLogger } from "@profitlayer/common";
import { WalletManager } from "./wallet/WalletManager.js";
import { TxExecutor } from "./transaction/TxExecutor.js";
import { TxSimulator } from "./transaction/TxSimulator.js";
import { encodeFunctionData } from "viem";

const logger = createLogger("supply-only");
const WETH_ARB = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
const AAVE_POOL_ARB = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";

async function main() {
  const walletManager = new WalletManager();
  const evmKey = process.env.EVM_PRIVATE_KEY || "";
  walletManager.loadEvmWallet(evmKey);
  
  const simulator = new TxSimulator();
  const executor = new TxExecutor(walletManager, simulator);
  
  const walletData = walletManager.getEvmClient("arbitrum");
  if (!walletData) {
    logger.error("无法获取钱包");
    return;
  }
  
  const walletAddr = walletData.account.address;
  const wrapAmount = BigInt(Math.floor(0.02 * 1e18));
  
  logger.info(`Supplying ${Number(wrapAmount)/1e18} WETH to Aave V3...`);
  
  const supplyPayload = {
    chain: "arbitrum" as Chain,
    to: AAVE_POOL_ARB,
    data: encodeFunctionData({
      abi: [{
        inputs: [
          { name: "asset", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "onBehalfOf", type: "address" },
          { name: "referralCode", type: "uint16" },
        ],
        name: "supply",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
      }] as const,
      functionName: "supply",
      args: [
        WETH_ARB as `0x${string}`,
        wrapAmount,
        walletAddr as `0x${string}`,
        0,
      ],
    }),
    value: "0",
  };

  try {
    const hash = await executor.execute(supplyPayload, TxType.DEPOSIT, 56, { action: "supply" });
    logger.info(`Supply 成功! TX Hash: ${hash}`);
    logger.info("🎉 交易完成！你现在在 Aave V3 Arbitrum 有仓位了！");
    logger.info("查看: https://arbiscan.io/address/" + walletAddr);
  } catch (err) {
    logger.error(`Supply 失败: ${(err as Error).message}`);
  }
}

main().catch(console.error);
