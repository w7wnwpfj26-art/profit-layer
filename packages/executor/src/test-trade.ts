// 手动触发一笔 Arbitrum 交易测试
import { Chain, TxType, createLogger } from "@defi-yield/common";
import { WalletManager } from "./wallet/WalletManager.js";
import { TxExecutor } from "./transaction/TxExecutor.js";
import { TxSimulator } from "./transaction/TxSimulator.js";
import { encodeFunctionData } from "viem";

const logger = createLogger("test-trade");

// Arbitrum WETH 地址
const WETH_ARB = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
// Aave V3 Pool on Arbitrum
const AAVE_POOL_ARB = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";

async function main() {
  // 初始化钱包
  const walletManager = new WalletManager();
  const evmKey = process.env.EVM_PRIVATE_KEY || "";
  if (!evmKey) {
    logger.error("缺少 EVM_PRIVATE_KEY");
    return;
  }
  
  walletManager.loadEvmWallet(evmKey);
  logger.info("钱包已加载");
  
  // 列出所有钱包
  const wallets = walletManager.listWallets();
  logger.info(`已加载钱包: ${JSON.stringify(wallets)}`);

  const simulator = new TxSimulator();
  const executor = new TxExecutor(walletManager, simulator);
  
  const usdcArb = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
  const wethArb = WETH_ARB;
  const swapAmountIn = String(1_000_000); // 1 USDC
  try {
    const rec = await executor.executeAggregatedSwap(Chain.ARBITRUM, usdcArb, wethArb, swapAmountIn, 1, 0.5);
    logger.info(`Aggregated swap (Arbitrum) TX: ${rec.txHash}`);
  } catch (err) {
    logger.error(`Aggregated swap failed: ${(err as Error).message}`);
  }
  
  // 直接使用字符串 "arbitrum"
  const walletData = walletManager.getEvmClient("arbitrum");
  if (!walletData) {
    logger.error("无法获取 Arbitrum 钱包");
    logger.info("可用链: " + [...walletManager.listWallets().map(w => w.chain)].join(", "));
    return;
  }
  
  const walletAddr = walletData.account.address;
  logger.info(`钱包地址: ${walletAddr}`);

  const wrapAmount = BigInt(Math.floor(0.002 * 1e18));

  // Step 2: Approve WETH → Aave
  logger.info("Step 2: Approving WETH for Aave...");
  const approvePayload = {
    chain: Chain.ARBITRUM,
    to: WETH_ARB,
    data: encodeFunctionData({
      abi: [{ inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], name: "approve", outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" }],
      functionName: "approve",
      args: [AAVE_POOL_ARB as `0x${string}`, BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")],
    }),
    value: "0",
  };

  try {
    const approveHash = await executor.execute(approvePayload, TxType.APPROVE, 0, { action: "manual_approve" });
    logger.info(`Approve 成功! TX: ${approveHash}`);
  } catch (err) {
    logger.error(`Approve 失败: ${(err as Error).message}`);
    return;
  }

  // Step 3: Supply WETH to Aave
  logger.info("Step 3: Supplying WETH to Aave V3...");
  const supplyPayload = {
    chain: Chain.ARBITRUM,
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
      }],
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
    const supplyHash = await executor.execute(supplyPayload, TxType.DEPOSIT, Number(wrapAmount) / 1e18 * 2800, { action: "manual_supply" });
    logger.info(`Supply 成功! TX: ${supplyHash}`);
    logger.info("🎉 交易完成！你现在在 Aave V3 Arbitrum 有仓位了！");
  } catch (err) {
    logger.error(`Supply 失败: ${(err as Error).message}`);
  }
}

main().catch(console.error);
