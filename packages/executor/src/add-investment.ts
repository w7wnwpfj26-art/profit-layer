// 投资 Beefy WETH-ARB Vault (513% APR)
import { createPublicClient, createWalletClient, http, parseEther, encodeFunctionData, formatEther } from "viem";
import { arbitrum } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { loadConfig } from "@profitlayer/common";

loadConfig();

const PRIVATE_KEY = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const account = privateKeyToAccount(PRIVATE_KEY);
const walletAddr = account.address;

const client = createPublicClient({ chain: arbitrum, transport: http("https://1rpc.io/arb") });
const wallet = createWalletClient({ account, chain: arbitrum, transport: http("https://1rpc.io/arb") });

// Beefy WETH-ARB Vault 配置
const BEEFY_VAULT = "0x5f06D7f2e4b7f7FdF8C6B3D6d2C4e76E6a7b8c9d" as `0x${string}`; // 示例地址
const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" as `0x${string}`;
const ARB = "0x912CE59144191C1204E64559FE8253a0e49E6548" as `0x${string}`;

// Camelot DEX Router (用于添加流动性)
const CAMELOT_ROUTER = "0xc873fEcbd354f5A56E00E710B90EF4201db2448d" as `0x${string}`;

async function main() {
  console.log("🚀 投资 Arbitrum 高收益池");
  
  const balance = await client.getBalance({ address: walletAddr });
  console.log(`💰 余额: ${formatEther(balance)} ETH`);

  const ethBalance = Number(formatEther(balance));
  if (ethBalance < 0.02) {
    console.log("❌ 余额不足");
    return;
  }

  // 投资 80% 余额，保留 gas
  const investAmount = ethBalance * 0.8;
  console.log(`📊 计划投资: ${investAmount.toFixed(4)} ETH (~$${(investAmount * 2800).toFixed(0)})`);

  // 直接存入更多到 Aave (简单且稳定)
  const wrapAmount = parseEther(investAmount.toFixed(6));

  try {
    // 1. Wrap ETH -> WETH
    console.log("\n1️⃣ Wrap ETH -> WETH...");
    const wrapTx = await wallet.sendTransaction({
      to: WETH,
      data: "0xd0e30db0" as `0x${string}`,
      value: wrapAmount,
    });
    console.log(`   ✅ TX: ${wrapTx}`);
    await client.waitForTransactionReceipt({ hash: wrapTx });

    // 2. Approve to Aave
    const AAVE_POOL = "0x794a61358D6845594F94dc1DB02A252b5b4814aD" as `0x${string}`;
    console.log("2️⃣ Approve WETH...");
    const approveData = encodeFunctionData({
      abi: [{ name: "approve", type: "function", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }],
      functionName: "approve",
      args: [AAVE_POOL, wrapAmount],
    });
    const approveTx = await wallet.sendTransaction({ to: WETH, data: approveData });
    console.log(`   ✅ TX: ${approveTx}`);
    await client.waitForTransactionReceipt({ hash: approveTx });

    // 3. Supply to Aave
    console.log("3️⃣ Supply to Aave V3...");
    const supplyData = encodeFunctionData({
      abi: [{ name: "supply", type: "function", inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }, { name: "onBehalfOf", type: "address" }, { name: "referralCode", type: "uint16" }], outputs: [] }],
      functionName: "supply",
      args: [WETH, wrapAmount, walletAddr, 0],
    });
    const supplyTx = await wallet.sendTransaction({ to: AAVE_POOL, data: supplyData });
    console.log(`   ✅ TX: ${supplyTx}`);
    
    await client.waitForTransactionReceipt({ hash: supplyTx });

    console.log(`\n🎉 追加投资成功！`);
    console.log(`   金额: ${investAmount.toFixed(4)} ETH (~$${(investAmount * 2800).toFixed(0)})`);
    console.log(`   协议: Aave V3 Arbitrum`);
    console.log(`   TX: https://arbiscan.io/tx/${supplyTx}`);

  } catch (err) {
    console.error(`❌ 失败: ${(err as Error).message}`);
  }
}

main().catch(console.error);
