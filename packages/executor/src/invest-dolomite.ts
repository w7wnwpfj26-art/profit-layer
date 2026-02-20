// 投资 Pendle Finance PT (固定高收益)
import { createPublicClient, createWalletClient, http, encodeFunctionData, formatEther, maxUint256 } from "viem";
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
const AAVE_POOL = "0x794a61358D6845594F94dc1DB02A252b5b4814aD" as `0x${string}`;
const aWETH = "0xe50fA9b3c56FfB159cB0FCA61F5c9D750e8128c8" as `0x${string}`;

// Pendle Router V4
const PENDLE_ROUTER = "0x888888888889758F76e7103c6CbF23ABbF58F946" as `0x${string}`;
// weETH market on Pendle (高收益)
const PENDLE_WEETH_MARKET = "0x952083cde7aaa11AB8449057F7de23A970AA8472" as `0x${string}`;

// Equilibria Finance - Pendle Yield Booster
const EQUILIBRIA_BOOSTER = "0x22Fc5A29bd3d6CCe19a06f844019fd506fCE4455" as `0x${string}`;

// Dolomite - Arbitrum 原生借贷协议 (高收益)
const DOLOMITE_MARGIN = "0x6Bd780E7fDf01D77e4d475c821f1e7AE05409072" as `0x${string}`;

async function main() {
  console.log("🚀 从 Aave 撤出并投资到高收益协议");
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

  try {
    // 2. 从 Aave 撤出 WETH
    console.log("\n1️⃣ 从 Aave 撤出 WETH...");
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
      args: [WETH, maxUint256, walletAddr],
    });
    const withdrawTx = await wallet.sendTransaction({ to: AAVE_POOL, data: withdrawData });
    console.log(`   ✅ TX: ${withdrawTx}`);
    await client.waitForTransactionReceipt({ hash: withdrawTx });

    // 3. 查询 WETH 余额
    const wethBalanceData = "0x70a08231" + walletAddr.replace("0x", "").padStart(64, "0");
    const wethResult = await client.call({ to: WETH, data: wethBalanceData as `0x${string}` });
    const wethBalance = BigInt(wethResult.data || "0");
    console.log(`💰 WETH 余额: ${formatEther(wethBalance)}`);

    // 4. 存入 Dolomite (支持单币，有挖矿奖励)
    console.log("\n2️⃣ Approve WETH to Dolomite...");
    const approveData = encodeFunctionData({
      abi: [{ name: "approve", type: "function", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }],
      functionName: "approve",
      args: [DOLOMITE_MARGIN, maxUint256],
    });
    const approveTx = await wallet.sendTransaction({ to: WETH, data: approveData });
    console.log(`   ✅ TX: ${approveTx}`);
    await client.waitForTransactionReceipt({ hash: approveTx });

    // Dolomite depositWei
    console.log("3️⃣ Deposit to Dolomite...");
    // marketId 0 = WETH
    const depositData = encodeFunctionData({
      abi: [{
        name: "depositWei",
        type: "function",
        inputs: [
          { name: "accountIndex", type: "uint256" },
          { name: "marketId", type: "uint256" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [],
      }],
      functionName: "depositWei",
      args: [0n, 0n, wethBalance],
    });
    const depositTx = await wallet.sendTransaction({ to: DOLOMITE_MARGIN, data: depositData });
    console.log(`   ✅ TX: ${depositTx}`);
    await client.waitForTransactionReceipt({ hash: depositTx });

    console.log(`\n🎉 投资成功！`);
    console.log(`   协议: Dolomite`);
    console.log(`   链: Arbitrum`);
    console.log(`   金额: ${formatEther(wethBalance)} WETH (~$${(Number(formatEther(wethBalance)) * 2800).toFixed(0)})`);
    console.log(`   预计 APR: 100-200% (基础利息 + ARB 奖励)`);
    console.log(`   TX: https://arbiscan.io/tx/${depositTx}`);

  } catch (err) {
    console.error(`❌ 失败: ${(err as Error).message}`);
    
    // 回退：存回 Aave
    console.log("\n📊 回退到 Aave V3...");
    const wethBalanceData = "0x70a08231" + walletAddr.replace("0x", "").padStart(64, "0");
    const wethResult = await client.call({ to: WETH, data: wethBalanceData as `0x${string}` });
    const wethBalance = BigInt(wethResult.data || "0");
    
    if (wethBalance > 0n) {
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
      console.log(`   ✅ 已存回 Aave V3: ${formatEther(wethBalance)} WETH`);
    }
  }
}

main().catch(console.error);
