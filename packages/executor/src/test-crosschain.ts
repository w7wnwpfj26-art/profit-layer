/**
 * 跨链测试：Arbitrum → Base USDC 跨链
 * 
 * 使用方法：
 *   cd packages/executor && pnpm run test:crosschain
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// 手动加载根目录 .env
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../../.env");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
} catch {
  console.log("⚠️ 未找到 .env 文件，使用环境变量");
}

import { Chain, createLogger } from "@profitlayer/common";
import { WalletManager } from "./wallet/WalletManager.js";
import { TxExecutor } from "./transaction/TxExecutor.js";
import { TxSimulator } from "./transaction/TxSimulator.js";
import { createPublicClient, http, formatEther, formatUnits } from "viem";
import { arbitrum, base } from "viem/chains";

const logger = createLogger("test-crosschain");

// USDC 地址
const USDC_ARB = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

async function main() {
  logger.info("🌉 跨链测试：Arbitrum → Base USDC");
  
  // 初始化钱包
  const walletManager = new WalletManager();
  const evmKey = process.env.EVM_PRIVATE_KEY || "";
  if (!evmKey) {
    logger.error("缺少 EVM_PRIVATE_KEY");
    return;
  }
  
  walletManager.loadEvmWallet(evmKey);
  logger.info("钱包已加载");
  
  const walletData = walletManager.getEvmClient("arbitrum");
  if (!walletData) {
    logger.error("无法获取 Arbitrum 钱包");
    return;
  }
  
  const walletAddr = walletData.account.address;
  logger.info(`钱包地址: ${walletAddr}`);
  
  // 创建公共客户端查询余额
  const arbClient = createPublicClient({ chain: arbitrum, transport: http("https://arb1.arbitrum.io/rpc") });
  const baseClient = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });
  
  // 查询余额
  logger.info("📊 查询余额...");
  
  try {
    // Arbitrum ETH
    const arbEth = await arbClient.getBalance({ address: walletAddr as `0x${string}` });
    logger.info(`Arbitrum ETH: ${formatEther(arbEth)}`);
    
    // Base ETH  
    const baseEth = await baseClient.getBalance({ address: walletAddr as `0x${string}` });
    logger.info(`Base ETH: ${formatEther(baseEth)}`);
    
    // Arbitrum USDC
    const usdcBalanceData = `0x70a08231${walletAddr.slice(2).padStart(64, "0")}`;
    const arbUsdcResult = await arbClient.call({ 
      to: USDC_ARB as `0x${string}`, 
      data: usdcBalanceData as `0x${string}` 
    });
    const arbUsdc = Number(BigInt(arbUsdcResult.data || "0x0")) / 1e6;
    logger.info(`Arbitrum USDC: ${arbUsdc.toFixed(2)}`);
    
    // Base USDC
    const baseUsdcResult = await baseClient.call({ 
      to: USDC_BASE as `0x${string}`, 
      data: usdcBalanceData as `0x${string}` 
    });
    const baseUsdc = Number(BigInt(baseUsdcResult.data || "0x0")) / 1e6;
    logger.info(`Base USDC: ${baseUsdc.toFixed(2)}`);
    
    // 检查是否有足够余额
    if (arbUsdc < 1) {
      logger.error(`❌ Arbitrum USDC 不足 (${arbUsdc.toFixed(2)})，需要至少 1 USDC 进行测试`);
      logger.info("建议：先向 Arbitrum 钱包转入一些 USDC");
      return;
    }
    
    if (Number(formatEther(arbEth)) < 0.0005) {
      logger.error(`❌ Arbitrum ETH 不足，需要至少 0.0005 ETH 作为 Gas`);
      return;
    }
    
    logger.info("✅ 余额检查通过，开始跨链测试...");
    
    // 初始化执行器
    const simulator = new TxSimulator();
    const executor = new TxExecutor(walletManager, simulator);
    
    // 跨链金额：1 USDC (最小测试)
    const crossChainAmount = "1000000"; // 1 USDC (6 decimals)
    
    logger.info(`🚀 开始跨链：${Number(crossChainAmount) / 1e6} USDC (Arbitrum → Base)`);
    
    // 执行跨链
    const result = await executor.executeCrossChain(
      Chain.ARBITRUM,
      Chain.BASE,
      USDC_ARB,
      USDC_BASE,
      crossChainAmount,
      { testRun: true, timestamp: Date.now() },
      {
        slippageBps: 50,           // 0.5% 滑点
        deadlineSeconds: 600,      // 10 分钟超时
        stepTimeoutMs: 120_000,    // 单步 2 分钟超时
        maxRetriesPerStep: 2,      // 每步最多重试 2 次
        fallbackToNextRoute: true, // 失败时尝试下一条路由
      }
    );
    
    if (result) {
      logger.info("✅ 跨链执行成功！");
      logger.info(`   Bridge: ${result.bridgeName}`);
      logger.info(`   安全评分: ${result.safetyScore}`);
      logger.info(`   预计到账: ${result.toAmount}`);
      logger.info(`   预计时间: ${result.estimatedTimeSeconds} 秒`);
      logger.info(`   总费用: $${result.totalCostUsd.toFixed(2)}`);
    } else {
      logger.error("❌ 跨链执行失败，未找到可用路由");
    }
    
  } catch (err) {
    logger.error(`跨链测试失败: ${(err as Error).message}`);
    console.error(err);
  }
}

main().catch(console.error);
