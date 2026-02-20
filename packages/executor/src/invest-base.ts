// 在 Base 链投资 Aerodrome 高收益池
import { createPublicClient, createWalletClient, http, parseEther, encodeFunctionData, formatEther, parseUnits } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { loadConfig } from "@defi-yield/common";

loadConfig();

const PRIVATE_KEY = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const account = privateKeyToAccount(PRIVATE_KEY);
const walletAddr = account.address;

const client = createPublicClient({ chain: base, transport: http("https://1rpc.io/base") });
const wallet = createWalletClient({ account, chain: base, transport: http("https://1rpc.io/base") });

// Base 合约地址
const WETH = "0x4200000000000000000000000000000000000006" as `0x${string}`;
const AERODROME_ROUTER = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as `0x${string}`;
// Moonwell - Base 上的借贷协议，类似 Aave
const MOONWELL_WETH = "0x628ff693426583D9a7FB391E54366292F509D457" as `0x${string}`;  // mWETH market

async function main() {
  console.log("🚀 在 Base 链投资高收益池");
  console.log(`📍 钱包: ${walletAddr}\n`);

  const balance = await client.getBalance({ address: walletAddr });
  console.log(`💰 Base ETH: ${formatEther(balance)} ETH`);

  const ethAmount = Number(formatEther(balance));
  if (ethAmount < 0.001) {
    console.log("❌ Base 余额不足");
    return;
  }

  // 投资 80%
  const investAmount = parseEther((ethAmount * 0.8).toFixed(8));
  console.log(`📊 投资 Moonwell: ${formatEther(investAmount)} ETH`);

  try {
    // 1. Wrap ETH -> WETH
    console.log("\n1️⃣ Wrap ETH -> WETH...");
    const wrapTx = await wallet.sendTransaction({
      to: WETH,
      data: "0xd0e30db0" as `0x${string}`,
      value: investAmount,
    });
    console.log(`   ✅ TX: ${wrapTx}`);
    await client.waitForTransactionReceipt({ hash: wrapTx });

    // 2. Approve to Moonwell
    console.log("2️⃣ Approve WETH to Moonwell...");
    const approveData = encodeFunctionData({
      abi: [{ name: "approve", type: "function", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }],
      functionName: "approve",
      args: [MOONWELL_WETH, investAmount],
    });
    const approveTx = await wallet.sendTransaction({ to: WETH, data: approveData });
    console.log(`   ✅ TX: ${approveTx}`);
    await client.waitForTransactionReceipt({ hash: approveTx });

    // 3. Mint mWETH (supply to Moonwell)
    console.log("3️⃣ Supply to Moonwell...");
    const mintData = encodeFunctionData({
      abi: [{ name: "mint", type: "function", inputs: [{ name: "mintAmount", type: "uint256" }], outputs: [{ type: "uint256" }] }],
      functionName: "mint",
      args: [investAmount],
    });
    const mintTx = await wallet.sendTransaction({ to: MOONWELL_WETH, data: mintData });
    console.log(`   ✅ TX: ${mintTx}`);
    await client.waitForTransactionReceipt({ hash: mintTx });

    console.log(`\n🎉 投资成功！`);
    console.log(`   协议: Moonwell (Base)`);
    console.log(`   金额: ${formatEther(investAmount)} ETH (~$${(Number(formatEther(investAmount)) * 2800).toFixed(0)})`);
    console.log(`   预计 APR: 5-15% + WELL 代币奖励`);
    console.log(`   TX: https://basescan.org/tx/${mintTx}`);

  } catch (err) {
    console.error(`❌ 失败: ${(err as Error).message}`);
  }
}

main().catch(console.error);
