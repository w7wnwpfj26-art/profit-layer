// 全自动投资脚本：Arbitrum 高收益池 + Base 跨链
import { createPublicClient, createWalletClient, http, parseEther, encodeFunctionData, formatEther } from "viem";
import { arbitrum, base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { loadConfig } from "@defi-yield/common";

loadConfig();

const PRIVATE_KEY = process.env.EVM_PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) {
  console.error("❌ 未找到 EVM_PRIVATE_KEY");
  process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY);
const walletAddr = account.address;

// Arbitrum 客户端
const arbClient = createPublicClient({ chain: arbitrum, transport: http("https://1rpc.io/arb") });
const arbWallet = createWalletClient({ account, chain: arbitrum, transport: http("https://1rpc.io/arb") });

// Base 客户端
const baseClient = createPublicClient({ chain: base, transport: http("https://1rpc.io/base") });
const baseWallet = createWalletClient({ account, chain: base, transport: http("https://1rpc.io/base") });

// Arbitrum 上的高收益目标
const TARGETS = {
  // Aave V3 WETH Supply (稳定收益)
  aaveV3: {
    pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD" as `0x${string}`,
    weth: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" as `0x${string}`,
  },
  // GMX GLP (高收益)
  gmxGlp: {
    rewardRouter: "0xA906F338CB21815cBc4Bc87ace9e68c87eF8d8F1" as `0x${string}`,
    glpManager: "0x3963FfC9dff443c2A94f21b129D429891E32ec18" as `0x${string}`,
  },
};

// 跨链桥配置 (Stargate)
const STARGATE = {
  arbitrum: {
    router: "0x53Bf833A5d6c4ddA888F69c22C88C9f356a41614" as `0x${string}`,
    eth: "0x82CbeCF39bEe528B5476FE6d1550af59a9dB6Fc0" as `0x${string}`,
  },
  base: {
    chainId: 184, // Stargate chain ID for Base
  },
};

async function main() {
  console.log("🚀 全自动高收益投资启动");
  console.log(`📍 钱包地址: ${walletAddr}`);

  // 1. 检查各链余额
  const arbBalance = await arbClient.getBalance({ address: walletAddr });
  const baseBalance = await baseClient.getBalance({ address: walletAddr });
  
  console.log(`\n💰 余额情况:`);
  console.log(`   Arbitrum: ${formatEther(arbBalance)} ETH`);
  console.log(`   Base: ${formatEther(baseBalance)} ETH`);

  const arbEth = Number(formatEther(arbBalance));
  const baseEth = Number(formatEther(baseBalance));

  if (arbEth < 0.01) {
    console.log("❌ Arbitrum 余额不足，无法操作");
    return;
  }

  // 2. 决策：是否跨链
  const HIGH_APR_THRESHOLD = 5000; // Base 上有 >5000% APR 的机会
  const shouldBridge = baseEth < 0.02;

  if (shouldBridge) {
    console.log("\n🌉 准备跨链到 Base (高收益机会更多)...");
    
    // 跨链 50% 的资金到 Base
    const bridgeAmount = arbEth * 0.5;
    console.log(`   计划桥接: ${bridgeAmount.toFixed(4)} ETH`);
    
    // 使用 Stargate 跨链
    try {
      const stargateData = encodeFunctionData({
        abi: [{
          name: "swapETH",
          type: "function",
          inputs: [
            { name: "_dstChainId", type: "uint16" },
            { name: "_refundAddress", type: "address" },
            { name: "_toAddress", type: "bytes" },
            { name: "_amountLD", type: "uint256" },
            { name: "_minAmountLD", type: "uint256" },
          ],
          outputs: [],
        }],
        functionName: "swapETH",
        args: [
          STARGATE.base.chainId,
          walletAddr,
          walletAddr as `0x${string}`,
          parseEther(bridgeAmount.toFixed(6)),
          parseEther((bridgeAmount * 0.995).toFixed(6)), // 0.5% 滑点
        ],
      });

      console.log("   📤 发送跨链交易...");
      const bridgeTx = await arbWallet.sendTransaction({
        to: STARGATE.arbitrum.router,
        data: stargateData,
        value: parseEther((bridgeAmount + 0.001).toFixed(6)), // 额外 gas
      });
      console.log(`   ✅ 跨链交易已发送: ${bridgeTx}`);
      console.log(`   ⏳ 预计 5-15 分钟到账 Base`);
    } catch (err) {
      console.log(`   ⚠️ 跨链失败: ${(err as Error).message}`);
      console.log("   继续在 Arbitrum 投资...");
    }
  }

  // 3. 在 Arbitrum 投资剩余资金
  const investAmount = shouldBridge ? arbEth * 0.4 : arbEth * 0.8; // 保留一些 gas
  
  if (investAmount > 0.01) {
    console.log(`\n💎 在 Arbitrum 投资 ${investAmount.toFixed(4)} ETH...`);
    
    // 先 Wrap ETH -> WETH
    const wrapAmount = parseEther(investAmount.toFixed(6));
    
    try {
      console.log("   1️⃣ Wrap ETH -> WETH...");
      const wrapTx = await arbWallet.sendTransaction({
        to: TARGETS.aaveV3.weth,
        data: "0xd0e30db0" as `0x${string}`, // deposit()
        value: wrapAmount,
      });
      console.log(`   ✅ Wrap TX: ${wrapTx}`);
      
      // 等待确认
      await arbClient.waitForTransactionReceipt({ hash: wrapTx });
      
      // Approve WETH to Aave
      console.log("   2️⃣ Approve WETH to Aave...");
      const approveData = encodeFunctionData({
        abi: [{
          name: "approve",
          type: "function",
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          outputs: [{ type: "bool" }],
        }],
        functionName: "approve",
        args: [TARGETS.aaveV3.pool, wrapAmount],
      });
      
      const approveTx = await arbWallet.sendTransaction({
        to: TARGETS.aaveV3.weth,
        data: approveData,
      });
      console.log(`   ✅ Approve TX: ${approveTx}`);
      await arbClient.waitForTransactionReceipt({ hash: approveTx });
      
      // Supply to Aave
      console.log("   3️⃣ Supply to Aave V3...");
      const supplyData = encodeFunctionData({
        abi: [{
          name: "supply",
          type: "function",
          inputs: [
            { name: "asset", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "onBehalfOf", type: "address" },
            { name: "referralCode", type: "uint16" },
          ],
          outputs: [],
        }],
        functionName: "supply",
        args: [TARGETS.aaveV3.weth, wrapAmount, walletAddr, 0],
      });
      
      const supplyTx = await arbWallet.sendTransaction({
        to: TARGETS.aaveV3.pool,
        data: supplyData,
      });
      console.log(`   ✅ Supply TX: ${supplyTx}`);
      
      const receipt = await arbClient.waitForTransactionReceipt({ hash: supplyTx });
      console.log(`\n🎉 投资成功！`);
      console.log(`   金额: ${investAmount.toFixed(4)} ETH (~$${(investAmount * 2800).toFixed(0)})`);
      console.log(`   协议: Aave V3 Arbitrum`);
      console.log(`   TX: https://arbiscan.io/tx/${supplyTx}`);
      
    } catch (err) {
      console.error(`❌ 投资失败: ${(err as Error).message}`);
    }
  }

  console.log("\n✅ 自动投资流程完成");
}

main().catch(console.error);
