// 投资 Pendle Finance - Arbitrum 上的高收益协议
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

// Pendle 合约地址 (Arbitrum)
const PENDLE_ROUTER = "0x00000000005BBB0EF59571E58418F9a4357b68A0" as `0x${string}`;
const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" as `0x${string}`;

// weETH market on Pendle (高收益)
const WEETH_MARKET = "0x952083cde7aaa11AB8449057F7de23A970AA8472" as `0x${string}`;
const WEETH_SY = "0xa6C895EB332E91c5b3D00B7baeEAae478cc502DA" as `0x${string}`;

// Radiant Capital - 另一个高收益借贷协议
const RADIANT_LENDING_POOL = "0xF4B1486DD74D07706052A33d31d7c0AAFD0659E1" as `0x${string}`;
const RADIANT_WETH = "0x0dF5dfd95966753f01cb80E76dc20EA958238C46" as `0x${string}`;  // rWETH

async function main() {
  console.log("🚀 投资 Radiant Capital (预计 APR: 15-30%)");
  console.log(`📍 钱包: ${walletAddr}\n`);

  const balance = await client.getBalance({ address: walletAddr });
  console.log(`💰 Arbitrum ETH: ${formatEther(balance)} ETH`);

  const ethAmount = Number(formatEther(balance));
  if (ethAmount < 0.02) {
    console.log("❌ 余额不足");
    return;
  }

  // 投资 90%
  const investAmount = parseEther((ethAmount * 0.9).toFixed(6));
  console.log(`📊 投资金额: ${formatEther(investAmount)} ETH (~$${(Number(formatEther(investAmount)) * 2800).toFixed(0)})`);

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

    // 2. Approve to Radiant
    console.log("2️⃣ Approve WETH to Radiant...");
    const approveData = encodeFunctionData({
      abi: [{ name: "approve", type: "function", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }],
      functionName: "approve",
      args: [RADIANT_LENDING_POOL, investAmount],
    });
    const approveTx = await wallet.sendTransaction({ to: WETH, data: approveData });
    console.log(`   ✅ TX: ${approveTx}`);
    await client.waitForTransactionReceipt({ hash: approveTx });

    // 3. Deposit to Radiant
    console.log("3️⃣ Deposit to Radiant...");
    const depositData = encodeFunctionData({
      abi: [{
        name: "deposit",
        type: "function",
        inputs: [
          { name: "asset", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "onBehalfOf", type: "address" },
          { name: "referralCode", type: "uint16" },
        ],
        outputs: [],
      }],
      functionName: "deposit",
      args: [WETH, investAmount, walletAddr, 0],
    });
    const depositTx = await wallet.sendTransaction({ to: RADIANT_LENDING_POOL, data: depositData });
    console.log(`   ✅ TX: ${depositTx}`);
    await client.waitForTransactionReceipt({ hash: depositTx });

    console.log(`\n🎉 投资成功！`);
    console.log(`   协议: Radiant Capital`);
    console.log(`   链: Arbitrum`);
    console.log(`   金额: ${formatEther(investAmount)} ETH (~$${(Number(formatEther(investAmount)) * 2800).toFixed(0)})`);
    console.log(`   预计 APR: 15-30% (基础收益 + RDNT 代币奖励)`);
    console.log(`   TX: https://arbiscan.io/tx/${depositTx}`);

  } catch (err) {
    console.error(`❌ 失败: ${(err as Error).message}`);
  }
}

main().catch(console.error);
