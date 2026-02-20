// 撤销 Aave V3 持仓并转投高收益池
import { createPublicClient, createWalletClient, http, encodeFunctionData, formatEther, parseEther, maxUint256 } from "viem";
import { arbitrum } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { loadConfig } from "@profitlayer/common";

loadConfig();

const PRIVATE_KEY = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const account = privateKeyToAccount(PRIVATE_KEY);
const walletAddr = account.address;

const client = createPublicClient({ chain: arbitrum, transport: http("https://1rpc.io/arb") });
const wallet = createWalletClient({ account, chain: arbitrum, transport: http("https://1rpc.io/arb") });

// Aave V3 配置
const AAVE_POOL = "0x794a61358D6845594F94dc1DB02A252b5b4814aD" as `0x${string}`;
const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" as `0x${string}`;
const aWETH = "0xe50fA9b3c56FfB159cB0FCA61F5c9D750e8128c8" as `0x${string}`;

async function getATokenBalance(): Promise<bigint> {
  const data = "0x70a08231" + walletAddr.replace("0x", "").padStart(64, "0");
  const result = await client.call({ to: aWETH, data: data as `0x${string}` });
  return BigInt(result.data || "0");
}

async function main() {
  console.log("🔄 撤销 Aave V3 持仓");
  console.log(`📍 钱包: ${walletAddr}`);

  // 1. 查询 aWETH 余额
  const aWethBalance = await getATokenBalance();
  console.log(`\n💰 aWETH 余额: ${formatEther(aWethBalance)} WETH`);

  if (aWethBalance === 0n) {
    console.log("❌ 无持仓可撤销");
    return;
  }

  try {
    // 2. 从 Aave 提取全部 WETH
    console.log("\n1️⃣ 从 Aave V3 提取 WETH...");
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
      args: [WETH, maxUint256, walletAddr], // maxUint256 = 提取全部
    });

    const withdrawTx = await wallet.sendTransaction({
      to: AAVE_POOL,
      data: withdrawData,
    });
    console.log(`   ✅ Withdraw TX: ${withdrawTx}`);
    await client.waitForTransactionReceipt({ hash: withdrawTx });

    // 3. 解包 WETH -> ETH
    console.log("2️⃣ Unwrap WETH -> ETH...");
    
    // 先查询 WETH 余额
    const wethBalanceData = "0x70a08231" + walletAddr.replace("0x", "").padStart(64, "0");
    const wethResult = await client.call({ to: WETH, data: wethBalanceData as `0x${string}` });
    const wethBalance = BigInt(wethResult.data || "0");
    console.log(`   WETH 余额: ${formatEther(wethBalance)}`);

    if (wethBalance > 0n) {
      const unwrapData = encodeFunctionData({
        abi: [{
          name: "withdraw",
          type: "function",
          inputs: [{ name: "wad", type: "uint256" }],
          outputs: [],
        }],
        functionName: "withdraw",
        args: [wethBalance],
      });

      const unwrapTx = await wallet.sendTransaction({
        to: WETH,
        data: unwrapData,
      });
      console.log(`   ✅ Unwrap TX: ${unwrapTx}`);
      await client.waitForTransactionReceipt({ hash: unwrapTx });
    }

    // 4. 查询最终 ETH 余额
    const finalBalance = await client.getBalance({ address: walletAddr });
    console.log(`\n🎉 撤销完成！`);
    console.log(`   ETH 余额: ${formatEther(finalBalance)} ETH (~$${(Number(formatEther(finalBalance)) * 2800).toFixed(0)})`);
    console.log(`   TX: https://arbiscan.io/tx/${withdrawTx}`);

    return formatEther(finalBalance);

  } catch (err) {
    console.error(`❌ 撤销失败: ${(err as Error).message}`);
  }
}

main().catch(console.error);
