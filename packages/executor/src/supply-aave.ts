// 存入 Aave V3（已有 WETH 余额）
import { createPublicClient, createWalletClient, http, encodeFunctionData, formatEther, maxUint256 } from "viem";
import { arbitrum } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { loadConfig } from "@profitlayer/common";

loadConfig();

const PRIVATE_KEY = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const account = privateKeyToAccount(PRIVATE_KEY);
const walletAddr = account.address;

const client = createPublicClient({ chain: arbitrum, transport: http("https://1rpc.io/arb") });
const wallet = createWalletClient({ account, chain: arbitrum, transport: http("https://1rpc.io/arb") });

const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" as `0x${string}`;
const AAVE_POOL = "0x794a61358D6845594F94dc1DB02A252b5b4814aD" as `0x${string}`;

async function main() {
  console.log("🚀 存入 Aave V3");

  const wethBalanceData = "0x70a08231" + walletAddr.replace("0x", "").padStart(64, "0");
  const wethResult = await client.call({ to: WETH, data: wethBalanceData as `0x${string}` });
  const wethBalance = BigInt(wethResult.data || "0");
  
  console.log(`💰 WETH: ${formatEther(wethBalance)}`);

  if (wethBalance === 0n) {
    console.log("❌ 无 WETH");
    return;
  }

  // Approve
  console.log("1️⃣ Approve...");
  const approveData = encodeFunctionData({
    abi: [{ name: "approve", type: "function", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }],
    functionName: "approve",
    args: [AAVE_POOL, maxUint256],
  });
  const approveTx = await wallet.sendTransaction({ to: WETH, data: approveData });
  await client.waitForTransactionReceipt({ hash: approveTx });
  console.log(`   ✅ ${approveTx}`);

  // Supply
  console.log("2️⃣ Supply to Aave...");
  const supplyData = encodeFunctionData({
    abi: [{ name: "supply", type: "function", inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }, { name: "onBehalfOf", type: "address" }, { name: "referralCode", type: "uint16" }], outputs: [] }],
    functionName: "supply",
    args: [WETH, wethBalance, walletAddr, 0],
  });
  const supplyTx = await wallet.sendTransaction({ to: AAVE_POOL, data: supplyData });
  await client.waitForTransactionReceipt({ hash: supplyTx });

  console.log(`\n🎉 投资成功！`);
  console.log(`   协议: Aave V3`);
  console.log(`   金额: ${formatEther(wethBalance)} WETH (~$${(Number(formatEther(wethBalance)) * 2800).toFixed(0)})`);
  console.log(`   TX: https://arbiscan.io/tx/${supplyTx}`);
}

main().catch(console.error);
