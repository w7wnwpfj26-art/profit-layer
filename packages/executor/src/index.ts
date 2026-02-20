// ============================================
// Executor Service Entry Point
//
// 完整的自动化执行闭环：
// 1. BullMQ Worker 接收 AI 信号并执行
// 2. DEX 聚合器寻找最优兑换路径
// 3. 资金归集器定期收割并兑换
// 4. AutoPilot 编排器串联全流程
// ============================================

import {
  Chain,
  TxType,
  createLogger,
  loadConfig,
  getDbPool,
  getRedisConnection,
  closeDbPool,
  closeRedis,
  createQueue,
  createWorker,
  query,
  QUEUES,
  type ExecuteTxJob,
} from "@profitlayer/common";
import { adapterRegistry, registerAllAdapters } from "@profitlayer/adapters";
import { WalletManager } from "./wallet/WalletManager.js";
import { TxExecutor } from "./transaction/TxExecutor.js";
import { TxSimulator } from "./transaction/TxSimulator.js";
import { GasOptimizer } from "./transaction/GasOptimizer.js";
import { DexAggregator } from "./router/DexAggregator.js";
import { FundCollector } from "./router/FundCollector.js";
import { AutoPilot } from "./orchestrator/AutoPilot.js";
import { approveTokensIfNeeded } from "./transaction/TokenApprover.js";
import { prepareFundsForDeposit, getWrappedNativeAddress, isWrappedNative } from "./transaction/FundPreparer.js";
import { DEFAULT_SLIPPAGE_PCT, SWAP_SLIPPAGE_PCT } from "./constants.js";

// Re-export
export { WalletManager } from "./wallet/WalletManager.js";
export { KeyVault } from "./wallet/KeyVault.js";
export { NonceManager } from "./wallet/NonceManager.js";
export { TxExecutor } from "./transaction/TxExecutor.js";
export { TxSimulator } from "./transaction/TxSimulator.js";
export { GasOptimizer } from "./transaction/GasOptimizer.js";
export { approveTokensIfNeeded, buildApprovePayload } from "./transaction/TokenApprover.js";
export { prepareFundsForDeposit, buildWrapPayload, getWrappedNativeAddress } from "./transaction/FundPreparer.js";
export { DexAggregator } from "./router/DexAggregator.js";
export { FundCollector } from "./router/FundCollector.js";
export { AutoPilot } from "./orchestrator/AutoPilot.js";
export * from "./strategies/AddLiquidity.js";
export * from "./strategies/RemoveLiquidity.js";
export * from "./strategies/Harvest.js";
export * from "./strategies/Compound.js";
export * from "./strategies/Rebalance.js";
export * from "./strategies/Swap.js";

const logger = createLogger("executor");

async function main(): Promise<void> {
  const config = loadConfig();

  logger.info("Executor 服务启动中...");

  // ---- 连接基础设施 ----
  const db = getDbPool();
  await db.query("SELECT 1");
  logger.info("数据库连接成功");

  const redis = getRedisConnection();
  await redis.ping();
  logger.info("Redis 连接成功");

  // ---- 注册协议适配器 ----
  registerAllAdapters();
  logger.info(`已注册 ${adapterRegistry.size} 个协议适配器`);

  // ---- 初始化钱包 ----
  const walletManager = new WalletManager();

  if (process.env.EVM_PRIVATE_KEY) {
    walletManager.loadEvmWallet(process.env.EVM_PRIVATE_KEY);
  }
  if (process.env.APTOS_PRIVATE_KEY) {
    walletManager.loadAptosWallet(process.env.APTOS_PRIVATE_KEY);
  }
  if (process.env.SOLANA_PRIVATE_KEY) {
    walletManager.loadSolanaWallet(process.env.SOLANA_PRIVATE_KEY);
  }

  const wallets = walletManager.listWallets();
  logger.info(`已加载 ${wallets.length} 个钱包`);

  // ---- 初始化核心组件 ----
  const executor = new TxExecutor(walletManager, new TxSimulator(), new GasOptimizer());
  const dexAggregator = new DexAggregator();
  const fundCollector = new FundCollector(executor, dexAggregator);

  // ---- BullMQ Worker: 处理来自 AI 引擎的执行指令 ----
  const worker = createWorker<ExecuteTxJob>(
    QUEUES.EXECUTE_TX,
    async (job) => {
      const { signalId, action, poolId, chain, protocolId, amountUsd, params } = job.data;

      logger.info(`处理执行任务: ${action}`, {
        signalId,
        poolId,
        chain,
        protocolId,
        amountUsd,
      });

      // 查找适配器
      const adapter = adapterRegistry.get(protocolId, chain as Chain);
      if (!adapter) {
        throw new Error(`找不到适配器: ${protocolId}@${chain}`);
      }

      // 确保适配器已初始化
      if (!adapter.isReady()) {
        logger.info(`初始化适配器: ${protocolId}@${chain}`);
        await adapter.initialize();
      }

      // 根据操作类型路由到具体执行逻辑
      switch (action) {
        case "enter": {
          // 进入仓位：可选资金准备（wrap + swap）→ DEX 聚合器兑换 → 添加流动性
          const walletAddr = walletManager.getAddress(chain as Chain) || "";
          let depositTokens = (params.tokens as Array<{ address: string; amount: string }>) || [];
          const needsFundPrep = depositTokens.length === 0 || depositTokens.every((t) => !t.amount || t.amount === "0");

          if (needsFundPrep && amountUsd > 0) {
            // 与 AutoPilot 对齐：链上余额 → wrap → 按池子代币 swap
            const chainTyped = chain as Chain;
            const wethAddr = getWrappedNativeAddress(chainTyped);
            if (wethAddr) {
              try {
                const poolRow = await query(
                  "SELECT tokens FROM pools WHERE pool_id = $1",
                  [poolId]
                ).then((r) => r.rows[0]);
                const poolTokens: Array<{ address: string; symbol?: string }> = poolRow?.tokens
                  ? (typeof poolRow.tokens === "string" ? JSON.parse(poolRow.tokens) : poolRow.tokens)
                  : [];
                const { createPublicClient, http: viemHttp } = await import("viem");
                const rpcUrl =
                  process.env[`${chainTyped.toUpperCase()}_RPC_URL`] ||
                  (chainTyped === "base" ? "https://mainnet.base.org"
                    : chainTyped === "arbitrum" ? "https://arb1.arbitrum.io/rpc"
                    : chainTyped === "polygon" ? "https://polygon-rpc.com"
                    : chainTyped === "bsc" ? "https://bsc-dataseed.binance.org"
                    : "https://eth.llamarpc.com");
                const publicClient = createPublicClient({ transport: viemHttp(rpcUrl) });
                const nativeBalanceWei = await publicClient.getBalance({ address: walletAddr as `0x${string}` });
                const nativeBalance = Number(nativeBalanceWei) / 1e18;
                const gasReserve = chainTyped === "ethereum" ? 0.02 : 0.003;
                const availableNative = nativeBalance - gasReserve;
                if (availableNative > 0.001) {
                  const maxPerSignal = availableNative * 0.2;
                  const ethToUse = Math.min(maxPerSignal, availableNative);
                  const ethWei = BigInt(Math.floor(ethToUse * 1e18));
                  await prepareFundsForDeposit(
                    executor,
                    chainTyped,
                    [{ address: wethAddr, amount: ethWei.toString() }],
                    amountUsd,
                    walletAddr,
                  );
                  const tokenCount = Math.max(poolTokens.length, 1);
                  const wethPerToken = ethWei / BigInt(tokenCount);
                  depositTokens = [];
                  for (const t of poolTokens) {
                    const addr = typeof t === "string" ? t : (t as { address: string }).address;
                    if (isWrappedNative(chainTyped, addr)) {
                      depositTokens.push({ address: addr, amount: wethPerToken.toString() });
                    } else {
                      try {
                        const quote = await dexAggregator.getBestQuote({
                          chain: chainTyped,
                          tokenIn: wethAddr,
                          tokenOut: addr,
                          amountIn: wethPerToken.toString(),
                          slippagePct: SWAP_SLIPPAGE_PCT,
                          senderAddress: walletAddr,
                        });
                        if (quote?.txPayload?.data && quote.txPayload.data !== "0x") {
                          await approveTokensIfNeeded(
                            executor,
                            chainTyped,
                            [{ address: wethAddr, amount: wethPerToken.toString() }],
                            quote.txPayload.to!
                          );
                          await executor.execute(
                            quote.txPayload,
                            TxType.SWAP,
                            0,
                            { signalId, action: "worker_pre_swap" }
                          );
                          depositTokens.push({
                            address: addr,
                            amount: quote.amountOut || wethPerToken.toString(),
                          });
                        } else {
                          depositTokens.push({ address: wethAddr, amount: wethPerToken.toString() });
                        }
                      } catch {
                        depositTokens.push({ address: wethAddr, amount: wethPerToken.toString() });
                      }
                    }
                  }
                  if (depositTokens.length === 0) {
                    depositTokens = [{ address: wethAddr, amount: ethWei.toString() }];
                  }
                  logger.info("Worker enter: 资金准备完成", { tokenCount: depositTokens.length });
                }
              } catch (err) {
                logger.warn("Worker enter: 资金准备失败，使用 params.tokens", { error: (err as Error).message });
              }
            }
          }

          // 若 job 显式指定先兑换（与资金准备互斥时仍可执行）
          if (!needsFundPrep && params.needsSwap && params.tokenIn && params.tokenOut) {
            logger.info("先通过 DEX 聚合器兑换代币...");
            const quote = await dexAggregator.getBestQuote({
              chain: chain as Chain,
              tokenIn: params.tokenIn as string,
              tokenOut: params.tokenOut as string,
              amountIn: (params.amountIn as string) || "0",
              slippagePct: SWAP_SLIPPAGE_PCT,
              senderAddress: walletAddr,
            });
            if (quote && quote.txPayload.data !== "0x") {
              await executor.execute(
                quote.txPayload,
                TxType.SWAP,
                amountUsd * 0.5,
                { signalId, action: "pre_swap", aggregator: quote.aggregator }
              );
              logger.info(`代币兑换完成，聚合器: ${quote.aggregator}`);
            }
          }

          // 添加流动性
          const depositPayload = await adapter.deposit({
            poolId,
            tokens: depositTokens,
            recipient: walletAddr,
            slippagePct: DEFAULT_SLIPPAGE_PCT,
          });

          // ERC20 Approve: 在 deposit 之前先授权合约花费代币
          if (depositPayload.to && depositTokens.length > 0) {
            await approveTokensIfNeeded(executor, chain as Chain, depositTokens, depositPayload.to);
          }

          const depositResult = await executor.execute(
            depositPayload,
            TxType.DEPOSIT,
            amountUsd,
            { signalId, action: "enter" }
          );

          // 记录持仓
          await query(
            `INSERT INTO positions (position_id, pool_id, wallet_address, chain_id, strategy_id, value_usd, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'active')
             ON CONFLICT (position_id) DO UPDATE SET value_usd = $6, updated_at = NOW()`,
            [`${protocolId}:${poolId}`, poolId, walletAddr, chain, params.strategyId || "auto", amountUsd]
          ).catch(() => {});

          logger.info(`进入仓位成功: ${protocolId}/${poolId}`, { txHash: depositResult.txHash });
          break;
        }

        case "exit": {
          const walletAddrExit = walletManager.getAddress(chain as Chain) || "";
          let lpAmount = (params.lpAmount as string) || "";
          
          // 修复：处理 "max" 和其他无效值
          if (!lpAmount || lpAmount === "0" || lpAmount === "max") {
            const position = await adapter.getPosition(walletAddrExit, poolId);
            lpAmount = position?.amountToken0?.toString() || "0";
            
            if (lpAmount === "0" || !lpAmount) {
              throw new Error(`链上查询持仓数量为 0，无法退出 (poolId: ${poolId})`);
            }
            
            logger.info("exit: lpAmount 未提供或为 'max'，从链上查询", { lpAmount });
          }

          // 确保 lpAmount 是有效的数字字符串
          try {
            BigInt(lpAmount);
          } catch (e) {
            throw new Error(`无效的 lpAmount: ${lpAmount}，无法转换为 BigInt`);
          }

          const withdrawPayload = await adapter.withdraw({
            poolId,
            lpAmount,
            recipient: walletAddrExit,
            slippagePct: DEFAULT_SLIPPAGE_PCT,
          });

          const withdrawResult = await executor.execute(
            withdrawPayload,
            TxType.WITHDRAW,
            amountUsd,
            { signalId, action: "exit" }
          );

          // 更新持仓状态
          await query(
            `UPDATE positions SET status = 'closed', closed_at = NOW() WHERE pool_id = $1 AND status = 'active'`,
            [poolId]
          ).catch(() => {});

          logger.info(`退出仓位成功: ${protocolId}/${poolId}`, { txHash: withdrawResult.txHash });
          break;
        }

        case "compound": {
          const compoundPayloads = await adapter.compound({ poolId });
          const hashes: string[] = [];

          for (const payload of compoundPayloads) {
            const result = await executor.execute(
              payload,
              TxType.COMPOUND,
              amountUsd / Math.max(compoundPayloads.length, 1),
              { signalId, action: "compound", step: hashes.length + 1 }
            );
            hashes.push(result.txHash);
          }

          logger.info(`复投成功: ${protocolId}/${poolId}`, { txHashes: hashes });
          break;
        }

        case "harvest": {
          const harvestPayload = await adapter.harvest({ poolId });
          const harvestResult = await executor.execute(
            harvestPayload,
            TxType.HARVEST,
            amountUsd,
            { signalId, action: "harvest" }
          );
          logger.info(`收割成功: ${protocolId}/${poolId}`, { txHash: harvestResult.txHash });
          break;
        }

        case "rebalance": {
          // 从一个池子移到另一个池子
          // Step 1: 退出旧仓位
          const exitPayload = await adapter.withdraw({
            poolId,
            lpAmount: (params.lpAmount as string) || "0",
            slippagePct: DEFAULT_SLIPPAGE_PCT,
          });
          await executor.execute(exitPayload, TxType.WITHDRAW, amountUsd, { signalId, action: "rebalance_exit" });

          // Step 2: 进入新仓位
          if (params.targetPoolId && params.targetProtocolId) {
            const targetAdapter = adapterRegistry.get(
              params.targetProtocolId as string,
              (params.targetChain as Chain) || chain as Chain
            );
            if (targetAdapter) {
              const enterPayload = await targetAdapter.deposit({
                poolId: params.targetPoolId as string,
                tokens: [],
                slippagePct: DEFAULT_SLIPPAGE_PCT,
              });
              await executor.execute(enterPayload, TxType.DEPOSIT, amountUsd, { signalId, action: "rebalance_enter" });
            }
          }

          logger.info(`调仓成功: ${poolId} → ${params.targetPoolId}`);
          break;
        }

        default:
          logger.warn(`未知操作类型: ${action}`);
      }

      // 记录审计日志
      await query(
        `INSERT INTO audit_log (event_type, severity, source, message, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          `signal_executed_${action}`,
          "info",
          "executor",
          `信号 ${signalId}: ${action} ${protocolId}/${poolId} $${amountUsd}`,
          JSON.stringify({ signalId, action, poolId, chain, protocolId, amountUsd }),
        ]
      ).catch(() => {});
    },
    { concurrency: 3 }
  );

  worker.on("completed", (job) => {
    logger.info(`任务完成: ${job.data.signalId}`);
  });

  worker.on("failed", async (job, err) => {
    logger.error(`任务失败: ${job?.data.signalId}`, { error: err.message });
    // 记录失败原因到 transactions，便于排查（失败可能发生在 executor.execute 之前）
    const d = job?.data;
    if (d && walletManager) {
      const walletAddr = walletManager.getAddress((d.chain as Chain) || "ethereum") || "";
      const errMsg = err?.message || String(err);
      const failureReason = errMsg.includes("simulation") ? "simulation" : errMsg.includes("gas") ? "gas" : "pre_execution";
      await query(
        `INSERT INTO transactions (tx_hash, chain_id, wallet_address, tx_type, amount_usd, gas_cost_usd, status, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          "none",
          d.chain || "ethereum",
          walletAddr,
          (d.action === "enter" ? "deposit" : d.action === "exit" ? "withdraw" : d.action) || "unknown",
          d.amountUsd ?? 0,
          0,
          "failed",
          JSON.stringify({
            ...(d.signalId && { signalId: d.signalId }),
            action: d.action,
            error: errMsg,
            failureReason,
            source: "worker_failed",
          }),
        ]
      ).catch((e) => logger.warn("Failed to log worker failure", { error: (e as Error).message }));
    }
  });

  // ---- Redis Stream → BullMQ 桥接（消费 Python AI 引擎写入的 execute-tx 信号） ----
  const EXECUTE_TX_STREAM = "bull:execute-tx:events";
  const executeTxQueue = createQueue(QUEUES.EXECUTE_TX);
  const streamRedis = getRedisConnection().duplicate();
  let streamBridgeRunning = true;

  const runStreamBridge = async (): Promise<void> => {
    let lastId = "$";
    while (streamBridgeRunning) {
      try {
        const result = await streamRedis.xread("BLOCK", 5000, "STREAMS", EXECUTE_TX_STREAM, lastId);
        if (!result || !result.length) continue;
        for (const [_stream, messages] of result) {
          for (const [msgId, fieldList] of messages as [string, string[]][]) {
            let dataStr: string | null = null;
            if (fieldList && fieldList.length >= 2) {
              const idx = fieldList.indexOf("data");
              if (idx >= 0 && idx + 1 < fieldList.length) dataStr = fieldList[idx + 1] ?? null;
            }
            if (dataStr) {
              try {
                const payload = JSON.parse(dataStr) as Record<string, unknown>;
                if (payload && payload.signalId != null && payload.action != null) {
                  const jobData: ExecuteTxJob = {
                    signalId: String(payload.signalId),
                    strategyId: String(payload.strategyId ?? "auto"),
                    action: String(payload.action),
                    poolId: String(payload.poolId ?? ""),
                    chain: String(payload.chain ?? "ethereum"),
                    protocolId: String(payload.protocolId ?? ""),
                    amountUsd: Number(payload.amountUsd ?? 0),
                    params: (payload.params && typeof payload.params === "object") ? (payload.params as Record<string, unknown>) : {},
                    timestamp: String(payload.timestamp ?? new Date().toISOString()),
                  };
                  await executeTxQueue.add("signal", jobData, {
                    attempts: 3,
                    backoff: { type: "exponential", delay: 5000 },
                  });
                  logger.info("Stream→Queue: 已入队", { signalId: jobData.signalId, action: jobData.action });
                }
              } catch (parseErr) {
                logger.warn("Stream 消息解析失败", { msgId, error: (parseErr as Error).message });
              }
            }
            lastId = msgId;
          }
        }
      } catch (err) {
        if (streamBridgeRunning) logger.error("Stream 桥接异常", { error: (err as Error).message });
      }
    }
    await streamRedis.quit();
  };
  runStreamBridge().catch((err) => logger.error("Stream 桥接退出", { error: (err as Error).message }));

  // ---- AutoPilot 自动编排器 ----
  const autoPilotEnabled = process.env.AUTOPILOT_ENABLED === "true";
  const autoPilotDryRun = process.env.AUTOPILOT_DRY_RUN !== "false"; // 默认模拟模式

  const autoPilot = new AutoPilot(executor, {
    enabled: autoPilotEnabled,
    dryRun: autoPilotDryRun,
    walletAddress: wallets[0]?.address || "",
    activeChains: [Chain.ETHEREUM, Chain.ARBITRUM, Chain.POLYGON, Chain.BASE, Chain.SOLANA, Chain.APTOS],
    totalCapitalUsd: parseFloat(process.env.TOTAL_CAPITAL_USD || "10000"),
    aiEngineUrl: `http://${config.aiEngine.host}:${config.aiEngine.port}`,
    cycleIntervalMs: parseInt(process.env.AUTOPILOT_CYCLE_MS || "", 10) || config.scanner.intervalMs,
    harvestIntervalMs: 6 * 60 * 60 * 1000,
    riskCheckIntervalMs: 60 * 1000,
  });

  // 在后台启动 AutoPilot
  if (autoPilotEnabled) {
    autoPilot.start().catch((err) => {
      logger.error("AutoPilot 异常退出", { error: (err as Error).message });
    });
  } else {
    logger.info("AutoPilot 未启用。设置 AUTOPILOT_ENABLED=true 启动全自动模式。");
  }

  // ---- 优雅关闭 ----
  const shutdown = async () => {
    logger.info("Executor 服务关闭中...");
    streamBridgeRunning = false;
    autoPilot.stop();
    await worker.close();
    await executeTxQueue.close();
    await closeDbPool();
    await closeRedis();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  logger.info("Executor 服务已启动");
  logger.info(`  BullMQ Worker: 监听 ${QUEUES.EXECUTE_TX} 队列`);
  logger.info(`  Stream 桥接: 消费 ${EXECUTE_TX_STREAM} → ${QUEUES.EXECUTE_TX}`);
  logger.info(`  DEX 聚合器: 1inch (EVM) / Jupiter (Solana) / Thala (Aptos)`);
  logger.info(`  资金归集器: 就绪`);
  logger.info(`  AutoPilot: ${autoPilotEnabled ? (autoPilotDryRun ? "模拟模式" : "⚠️ 真实模式") : "未启用"}`);
}

main().catch((err) => {
  logger.error("Executor 服务启动失败", { error: (err as Error).message });
  process.exit(1);
});
