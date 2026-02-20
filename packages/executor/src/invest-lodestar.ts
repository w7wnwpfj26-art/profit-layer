// 投资 Silo Finance - Arbitrum 隔离借贷协议
import { createPublicClient, createWalletClient, http, parseEther, encodeFunctionData, formatEther, maxUint256 } from "viem";
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

// Silo V2 Router
const SILO_ROUTER = "0x9992f660137979C1ca7f8b119Cd16361594E3681" as `0x${string}`;
// Silo V2 WETH market
const SILO_WETH_MARKET = "0x033E35b9d9f9C6C4d73bb1A99cF8e1D8F4E7C3F8" as `0x${string}`;

// Lodestar Finance - Arbitrum 借贷协议
const LODESTAR_WETH = "0x1ca530f02DD0487cef4943c674342c5aEa08922F" as `0x${string}`;

async function main() {
  console.log("🚀 投资 Lodestar Finance (预计 APR: 8-20%)");
  console.log(`📍 钱包: ${walletAddr}\n`);

  // 先查询 WETH 余额（之前 wrap 了）
  const wethBalanceData = "0x70a08231" + walletAddr.replace("0x", "").padStart(64, "0");
  const wethResult = await client.call({ to: WETH, data: wethBalanceData as `0x${string}` });
  const wethBalance = BigInt(wethResult.data || "0");
  
  const ethBalance = await client.getBalance({ address: walletAddr });
  
  console.log(`💰 ETH: ${formatEther(ethBalance)}`);
  console.log(`💰 WETH: ${formatEther(wethBalance)}`);

  const totalEth = Number(formatEther(ethBalance)) + Number(formatEther(wethBalance));
  if (totalEth < 0.02) {
    console.log("❌ 余额不足");
    return;
  }

  try {
    // 如果有 ETH，先 wrap
    if (ethBalance > parseEther("0.02")) {
      const wrapAmount = ethBalance - parseEther("0.01"); // 保留 0.01 ETH gas
      console.log(`\n1️⃣ Wrap ${formatEther(wrapAmount)} ETH -> WETH...`);
      const wrapTx = await wallet.sendTransaction({
        to: WETH,
        data: "0xd0e30db0" as `0x${string}`,
        value: wrapAmount,
      });
      await client.waitForTransactionReceipt({ hash: wrapTx });
      console.log(`   ✅ TX: ${wrapTx}`);
    }

    // 重新查询 WETH 余额
    const newWethResult = await client.call({ to: WETH, data: wethBalanceData as `0x${string}` });
    const newWethBalance = BigInt(newWethResult.data || "0");
    console.log(`💰 当前 WETH: ${formatEther(newWethBalance)}`);

    // Approve to Lodestar
    console.log("2️⃣ Approve WETH to Lodestar...");
    const approveData = encodeFunctionData({
      abi: [{ name: "approve", type: "function", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }],
      functionName: "approve",
      args: [LODESTAR_WETH, maxUint256],
    });
    const approveTx = await wallet.sendTransaction({ to: WETH, data: approveData });
    await client.waitForTransactionReceipt({ hash: approveTx });
    console.log(`   ✅ TX: ${approveTx}`);

    // Mint lWETH (Lodestar cToken)
    console.log("3️⃣ Deposit to Lodestar...");
    const mintData = encodeFunctionData({
      abi: [{ name: "mint", type: "function", inputs: [{ name: "mintAmount", type: "uint256" }], outputs: [{ type: "uint256" }] }],
      functionName: "mint",
      args: [newWethBalance],
    });
    const mintTx = await wallet.sendTransaction({ to: LODESTAR_WETH, data: mintData });
    await client.waitForTransactionReceipt({ hash: mintTx });

    console.log(`\n🎉 投资成功！`);
    console.log(`   协议: Lodestar Finance`);
    console.log(`   链: Arbitrum`);
    console.log(`   金额: ${formatEther(newWethBalance)} WETH (~$${(Number(formatEther(newWethBalance)) * 2800).toFixed(0)})`);
    console.log(`   预计 APR: 8-20% (基础利息 + LODE 代币奖励)`);
    console.log(`   TX: https://arbiscan.io/tx/${mintTx}`);

  } catch (err) {
    console.error(`❌ 失败: ${(err as Error).message}`);
  }
}

main().catch(console.error);
