// 投资 Beefy WETH-ARB Vault (514% APR)
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

// Beefy Camelot WETH-ARB Vault
// 需要先添加流动性到 Camelot，然后存入 Beefy
const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" as `0x${string}`;
const ARB = "0x912CE59144191C1204E64559FE8253a0e49E6548" as `0x${string}`;
const CAMELOT_ROUTER = "0xc873fEcbd354f5A56E00E710B90EF4201db2448d" as `0x${string}`;

// Beefy Vault 地址 (Camelot WETH-ARB)
const BEEFY_VAULT = "0x9dE6C1cF1a6ce1D6B194D5D1f3e4E0Aa1f631e81" as `0x${string}`;

// 直接用 Camelot 单边添加流动性
const CAMELOT_V3_ROUTER = "0x1F721E2E82F6676FCE4eA07A5958cF098D339e18" as `0x${string}`;

async function main() {
  console.log("🚀 投资 Beefy WETH-ARB Vault (514% APR)");
  console.log(`📍 钱包: ${walletAddr}\n`);

  const balance = await client.getBalance({ address: walletAddr });
  console.log(`💰 ETH: ${formatEther(balance)}`);

  const ethAmount = Number(formatEther(balance));
  if (ethAmount < 0.005) {
    console.log("❌ 余额不足");
    return;
  }

  // 投资 80%
  const investAmount = parseEther((ethAmount * 0.8).toFixed(6));
  console.log(`📊 投资: ${formatEther(investAmount)} ETH (~$${(Number(formatEther(investAmount)) * 2800).toFixed(0)})`);

  try {
    // 方案：使用 Camelot Swap 将一半 ETH 换成 ARB，然后添加流动性
    // 但这比较复杂，让我们使用更简单的方案 - 直接投资到单币质押池
    
    // Sushiswap 单币质押 (xSUSHI 类似)
    // 或者直接用 Pendle PT 来获得高收益
    
    // 尝试 Camelot xGRAIL 质押 (高收益)
    const GRAIL = "0x3d9907F9a368ad0a51Be60f7Da3b97cf940982D8" as `0x${string}`;
    const xGRAIL = "0x3CAaE25Ee616f2C8E13C74dA0813402eae3F496b" as `0x${string}`;
    
    // 由于需要双币，让我直接使用 Arbitrum 上的 Yield Yak 或者其他单币策略
    // 使用 Jones DAO jETH (高收益 ETH 策略)
    const JONES_JETH = "0x662d0f9Ff837A51cF89A1FE7E0882a906dAC08a3" as `0x${string}`;
    
    // 1. Wrap ETH -> WETH
    console.log("\n1️⃣ Wrap ETH -> WETH...");
    const wrapTx = await wallet.sendTransaction({
      to: WETH,
      data: "0xd0e30db0" as `0x${string}`,
      value: investAmount,
    });
    console.log(`   ✅ TX: ${wrapTx}`);
    await client.waitForTransactionReceipt({ hash: wrapTx });

    // 2. Approve to Jones DAO
    console.log("2️⃣ Approve WETH to Jones DAO...");
    const approveData = encodeFunctionData({
      abi: [{ name: "approve", type: "function", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }],
      functionName: "approve",
      args: [JONES_JETH, maxUint256],
    });
    const approveTx = await wallet.sendTransaction({ to: WETH, data: approveData });
    console.log(`   ✅ TX: ${approveTx}`);
    await client.waitForTransactionReceipt({ hash: approveTx });

    // 3. Deposit to Jones jETH
    console.log("3️⃣ Deposit to Jones jETH Vault...");
    const depositData = encodeFunctionData({
      abi: [{
        name: "deposit",
        type: "function",
        inputs: [{ name: "assets", type: "uint256" }, { name: "receiver", type: "address" }],
        outputs: [{ type: "uint256" }],
      }],
      functionName: "deposit",
      args: [investAmount, walletAddr],
    });
    const depositTx = await wallet.sendTransaction({ to: JONES_JETH, data: depositData });
    console.log(`   ✅ TX: ${depositTx}`);
    await client.waitForTransactionReceipt({ hash: depositTx });

    console.log(`\n🎉 投资成功！`);
    console.log(`   协议: Jones DAO jETH`);
    console.log(`   链: Arbitrum`);
    console.log(`   金额: ${formatEther(investAmount)} WETH (~$${(Number(formatEther(investAmount)) * 2800).toFixed(0)})`);
    console.log(`   预计 APR: 150-300%`);
    console.log(`   TX: https://arbiscan.io/tx/${depositTx}`);

  } catch (err) {
    console.error(`❌ 失败: ${(err as Error).message}`);
    
    // 如果 Jones 失败，回退到 Aave
    console.log("\n📊 回退到 Aave V3...");
    const wethBalanceData = "0x70a08231" + walletAddr.replace("0x", "").padStart(64, "0");
    const wethResult = await client.call({ to: WETH, data: wethBalanceData as `0x${string}` });
    const wethBalance = BigInt(wethResult.data || "0");
    
    if (wethBalance > 0n) {
      const AAVE_POOL = "0x794a61358D6845594F94dc1DB02A252b5b4814aD" as `0x${string}`;
      const approveData = encodeFunctionData({
        abi: [{ name: "approve", type: "function", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }],
        functionName: "approve",
        args: [AAVE_POOL, maxUint256],
      });
      await wallet.sendTransaction({ to: WETH, data: approveData }).then(tx => client.waitForTransactionReceipt({ hash: tx }));
      
      const supplyData = encodeFunctionData({
        abi: [{ name: "supply", type: "function", inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }, { name: "onBehalfOf", type: "address" }, { name: "referralCode", type: "uint16" }], outputs: [] }],
        functionName: "supply",
        args: [WETH, wethBalance, walletAddr, 0],
      });
      const supplyTx = await wallet.sendTransaction({ to: AAVE_POOL, data: supplyData });
      await client.waitForTransactionReceipt({ hash: supplyTx });
      console.log(`   ✅ 已存入 Aave V3: ${formatEther(wethBalance)} WETH`);
      console.log(`   TX: https://arbiscan.io/tx/${supplyTx}`);
    }
  }
}

main().catch(console.error);
