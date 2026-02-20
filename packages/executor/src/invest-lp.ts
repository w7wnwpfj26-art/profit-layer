// 换币并投资到高收益 LP
import { createPublicClient, createWalletClient, http, encodeFunctionData, formatEther, maxUint256, parseEther } from "viem";
import { arbitrum } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { loadConfig } from "@defi-yield/common";

loadConfig();

const PRIVATE_KEY = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const account = privateKeyToAccount(PRIVATE_KEY);
const walletAddr = account.address;

const client = createPublicClient({ chain: arbitrum, transport: http("https://1rpc.io/arb") });
const wallet = createWalletClient({ account, chain: arbitrum, transport: http("https://1rpc.io/arb") });

const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" as `0x${string}`;
const ARB = "0x912CE59144191C1204E64559FE8253a0e49E6548" as `0x${string}`;
const AAVE_POOL = "0x794a61358D6845594F94dc1DB02A252b5b4814aD" as `0x${string}`;
const aWETH = "0xe50fA9b3c56FfB159cB0FCA61F5c9D750e8128c8" as `0x${string}`;

// Camelot Router V2
const CAMELOT_ROUTER = "0xc873fEcbd354f5A56E00E710B90EF4201db2448d" as `0x${string}`;

async function main() {
  console.log("🚀 投资到 WETH-ARB LP (514% APR)");
  console.log(`📍 钱包: ${walletAddr}\n`);

  // 1. 查询 Aave aWETH 余额
  const aWethBalanceData = "0x70a08231" + walletAddr.replace("0x", "").padStart(64, "0");
  const aWethResult = await client.call({ to: aWETH, data: aWethBalanceData as `0x${string}` });
  const aWethBalance = BigInt(aWethResult.data || "0");
  
  console.log(`💰 Aave aWETH: ${formatEther(aWethBalance)}`);

  if (aWethBalance === 0n) {
    console.log("❌ 无 Aave 持仓");
    return;
  }

  // 用 50% 来投资 LP
  const investAmount = aWethBalance / 2n;
  console.log(`📊 计划投资: ${formatEther(investAmount)} WETH (~$${(Number(formatEther(investAmount)) * 2800).toFixed(0)})`);

  try {
    // 2. 从 Aave 撤出一半
    console.log("\n1️⃣ 从 Aave 撤出一半 WETH...");
    const withdrawData = encodeFunctionData({
      abi: [{
        name: "withdraw",
        type: "function",
        inputs: [
          { name: "asset", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "to", type: "address" },
        ],
        outputs: [{ type: "uint256" }],
      }],
      functionName: "withdraw",
      args: [WETH, investAmount, walletAddr],
    });
    const withdrawTx = await wallet.sendTransaction({ to: AAVE_POOL, data: withdrawData });
    console.log(`   ✅ TX: ${withdrawTx}`);
    await client.waitForTransactionReceipt({ hash: withdrawTx });

    // 3. 查询 WETH 余额
    const wethBalanceData = "0x70a08231" + walletAddr.replace("0x", "").padStart(64, "0");
    const wethResult = await client.call({ to: WETH, data: wethBalanceData as `0x${string}` });
    const wethBalance = BigInt(wethResult.data || "0");
    console.log(`💰 WETH 余额: ${formatEther(wethBalance)}`);

    // 4. Swap 一半 WETH -> ARB (用于 LP)
    const swapAmount = wethBalance / 2n;
    console.log(`\n2️⃣ Swap ${formatEther(swapAmount)} WETH -> ARB...`);
    
    // Approve WETH to Camelot
    const approveData = encodeFunctionData({
      abi: [{ name: "approve", type: "function", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }],
      functionName: "approve",
      args: [CAMELOT_ROUTER, maxUint256],
    });
    await wallet.sendTransaction({ to: WETH, data: approveData }).then(tx => client.waitForTransactionReceipt({ hash: tx }));
    console.log(`   ✅ Approved`);

    // Swap WETH -> ARB
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
    const swapData = encodeFunctionData({
      abi: [{
        name: "swapExactTokensForTokensSupportingFeeOnTransferTokens",
        type: "function",
        inputs: [
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMin", type: "uint256" },
          { name: "path", type: "address[]" },
          { name: "to", type: "address" },
          { name: "referrer", type: "address" },
          { name: "deadline", type: "uint256" },
        ],
        outputs: [],
      }],
      functionName: "swapExactTokensForTokensSupportingFeeOnTransferTokens",
      args: [swapAmount, 0n, [WETH, ARB], walletAddr, "0x0000000000000000000000000000000000000000" as `0x${string}`, deadline],
    });
    const swapTx = await wallet.sendTransaction({ to: CAMELOT_ROUTER, data: swapData });
    console.log(`   ✅ Swap TX: ${swapTx}`);
    await client.waitForTransactionReceipt({ hash: swapTx });

    // 5. 查询 ARB 余额
    const arbBalanceData = "0x70a08231" + walletAddr.replace("0x", "").padStart(64, "0");
    const arbResult = await client.call({ to: ARB, data: arbBalanceData as `0x${string}` });
    const arbBalance = BigInt(arbResult.data || "0");
    console.log(`💰 ARB 余额: ${formatEther(arbBalance)}`);

    // 重新查询 WETH 余额
    const newWethResult = await client.call({ to: WETH, data: wethBalanceData as `0x${string}` });
    const newWethBalance = BigInt(newWethResult.data || "0");
    console.log(`💰 WETH 余额: ${formatEther(newWethBalance)}`);

    // 6. Approve ARB
    console.log("\n3️⃣ 添加流动性...");
    const approveArbData = encodeFunctionData({
      abi: [{ name: "approve", type: "function", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }],
      functionName: "approve",
      args: [CAMELOT_ROUTER, maxUint256],
    });
    await wallet.sendTransaction({ to: ARB, data: approveArbData }).then(tx => client.waitForTransactionReceipt({ hash: tx }));

    // 7. Add Liquidity
    const addLiquidityData = encodeFunctionData({
      abi: [{
        name: "addLiquidity",
        type: "function",
        inputs: [
          { name: "tokenA", type: "address" },
          { name: "tokenB", type: "address" },
          { name: "amountADesired", type: "uint256" },
          { name: "amountBDesired", type: "uint256" },
          { name: "amountAMin", type: "uint256" },
          { name: "amountBMin", type: "uint256" },
          { name: "to", type: "address" },
          { name: "deadline", type: "uint256" },
        ],
        outputs: [
          { type: "uint256" },
          { type: "uint256" },
          { type: "uint256" },
        ],
      }],
      functionName: "addLiquidity",
      args: [WETH, ARB, newWethBalance, arbBalance, 0n, 0n, walletAddr, deadline],
    });
    const lpTx = await wallet.sendTransaction({ to: CAMELOT_ROUTER, data: addLiquidityData });
    console.log(`   ✅ LP TX: ${lpTx}`);
    await client.waitForTransactionReceipt({ hash: lpTx });

    console.log(`\n🎉 投资成功！`);
    console.log(`   池子: WETH-ARB LP (Camelot)`);
    console.log(`   链: Arbitrum`);
    console.log(`   预计 APR: 500%+ (交易费 + GRAIL 奖励)`);
    console.log(`   TX: https://arbiscan.io/tx/${lpTx}`);

  } catch (err) {
    console.error(`❌ 失败: ${(err as Error).message}`);
  }
}

main().catch(console.error);
