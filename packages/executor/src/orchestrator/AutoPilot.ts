// ============================================
// 全自动编排器 (AutoPilot Orchestrator)
//
// 将 Scanner → AI → Executor 串成真正的自动闭环。
//
// 工作循环：
// ┌────────────────────────────────────────────────┐
// │  1. 扫描：获取全网最新池子 APR                    │
// │  2. 分析：AI 评估风险、计算净收益、优化组合         │
// │  3. 决策：生成 进入/退出/复投/调仓 信号             │
// │  4. 执行：DEX 聚合器找最优路径，提交交易             │
// │  5. 归集：定期收割奖励，兑换归集                    │
// │  6. 监控：清算风险、异常检测、止损                   │
// │  7. 等待：休眠到下个周期                           │
// └────────────────────────────────────────────────┘
// ============================================

import {
  Chain,
  TxType,
  createLogger,
  loadConfig,
  query,
  createQueue,
  QUEUES,
  CHAIN_CONFIGS,
  type StrategyComputeJob,
  type ExecuteTxJob,
} from "@profitlayer/common";
import { adapterRegistry } from "@profitlayer/adapters";
import type { TxExecutor } from "../transaction/TxExecutor.js";
import { approveTokensIfNeeded } from "../transaction/TokenApprover.js";
import { prepareFundsForDeposit, getWrappedNativeAddress, isWrappedNative } from "../transaction/FundPreparer.js";
import { DexAggregator } from "../router/DexAggregator.js";
import { DEFAULT_SLIPPAGE_PCT, SWAP_SLIPPAGE_PCT } from "../constants.js";
import { FundCollector } from "../router/FundCollector.js";

const logger = createLogger("executor:autopilot");

// ---- 配置 ----

export interface AutoPilotConfig {
  enabled: boolean;
  cycleIntervalMs: number;         // 主循环间隔（毫秒）
  harvestIntervalMs: number;       // 收割归集间隔
  riskCheckIntervalMs: number;     // 风险检查间隔
  aiEngineUrl: string;             // AI 引擎地址
  walletAddress: string;           // 操作钱包
  activeChains: Chain[];           // 活跃链
  totalCapitalUsd: number;         // 总资金
  dryRun: boolean;                 // 模拟模式
  minConfidence: number;           // 最低置信度阈值（0.4 = 激进, 0.6 = 保守）
  // 动态周期调整
  dynamicCycleEnabled: boolean;    // 是否启用波动率自适应周期
  minCycleIntervalMs: number;      // 高波动时最短周期
  maxCycleIntervalMs: number;      // 低波动时最长周期
  volatilityWindow: number;        // 波动率计算窗口（小时）
  // 错误监控
  maxConsecutiveErrors: number;    // 连续错误阈值
  alertWebhookUrl: string;         // 告警 Webhook URL
}

const DEFAULT_CONFIG: AutoPilotConfig = {
  enabled: false,
  cycleIntervalMs: parseInt(process.env.AUTOPILOT_CYCLE_MS || "") || 60 * 60 * 1000,
  harvestIntervalMs: parseInt(process.env.AUTOPILOT_HARVEST_MS || "") || 6 * 60 * 60 * 1000,
  riskCheckIntervalMs: parseInt(process.env.AUTOPILOT_RISK_CHECK_MS || "") || 60 * 1000,
  aiEngineUrl: "http://localhost:8000",
  walletAddress: "",
  activeChains: [
    Chain.ETHEREUM, Chain.ARBITRUM, Chain.POLYGON,
    Chain.BASE, Chain.SOLANA, Chain.APTOS,
  ],
  totalCapitalUsd: 10_000,
  dryRun: true,
  minConfidence: 0.4,
  // 动态周期
  dynamicCycleEnabled: process.env.AUTOPILOT_DYNAMIC_CYCLE !== "false",
  minCycleIntervalMs: parseInt(process.env.AUTOPILOT_MIN_CYCLE_MS || "") || 5 * 60 * 1000,   // 5分钟
  maxCycleIntervalMs: parseInt(process.env.AUTOPILOT_MAX_CYCLE_MS || "") || 2 * 60 * 60 * 1000, // 2小时
  volatilityWindow: parseInt(process.env.AUTOPILOT_VOL_WINDOW_HR || "") || 6,
  // 错误监控
  maxConsecutiveErrors: parseInt(process.env.AUTOPILOT_MAX_ERRORS || "") || 5,
  alertWebhookUrl: process.env.AUTOPILOT_ALERT_WEBHOOK || "",
};

// ---- 错误追踪器 ----

interface ErrorRecord {
  timestamp: number;
  phase: string;
  message: string;
  cycle: number;
}

class ErrorTracker {
  private consecutiveErrors = 0;
  private totalErrors = 0;
  private recentErrors: ErrorRecord[] = [];
  private readonly maxRecent = 50;

  record(phase: string, message: string, cycle: number): void {
    this.consecutiveErrors++;
    this.totalErrors++;
    this.recentErrors.push({ timestamp: Date.now(), phase, message, cycle });
    if (this.recentErrors.length > this.maxRecent) {
      this.recentErrors.shift();
    }
  }

  reset(): void {
    this.consecutiveErrors = 0;
  }

  get consecutive(): number { return this.consecutiveErrors; }
  get total(): number { return this.totalErrors; }
  get recent(): ErrorRecord[] { return this.recentErrors; }

  /** 统计最近 N 分钟内各阶段的错误数 */
  summarize(minutes = 60): Record<string, number> {
    const since = Date.now() - minutes * 60_000;
    const summary: Record<string, number> = {};
    for (const e of this.recentErrors) {
      if (e.timestamp >= since) {
        summary[e.phase] = (summary[e.phase] || 0) + 1;
      }
    }
    return summary;
  }
}

// ---- AutoPilot ----

export class AutoPilot {
  private config: AutoPilotConfig;
  private dexAggregator: DexAggregator;
  private fundCollector: FundCollector;
  private running = false;
  private cycleCount = 0;
  private lastHarvestTime = 0;
  private lastRiskCheckTime = 0;
  // 动态周期
  private currentCycleMs: number;
  private lastAprValues: number[] = [];  // APR 历史窗口，用于计算波动率
  // 错误监控
  private errorTracker = new ErrorTracker();
  private paused = false;

  constructor(
    private executor: TxExecutor,
    config?: Partial<AutoPilotConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentCycleMs = this.config.cycleIntervalMs;
    this.dexAggregator = new DexAggregator();
    this.fundCollector = new FundCollector(executor, this.dexAggregator);
  }

  /**
   * 启动全自动运行
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      logger.warn("AutoPilot 未启用。设置 enabled: true 并确认你了解风险后再启动。");
      return;
    }

    if (this.config.dryRun) {
      logger.info("AutoPilot 以模拟模式启动（不会执行真实交易）");
    } else {
      logger.warn("⚠️ AutoPilot 以真实模式启动！所有交易将自动执行！");
    }

    this.running = true;

    logger.info("AutoPilot 启动", {
      cycleInterval: `${this.config.cycleIntervalMs / 1000}s`,
      harvestInterval: `${this.config.harvestIntervalMs / 3600000}h`,
      chains: this.config.activeChains,
      capital: `$${this.config.totalCapitalUsd}`,
      dryRun: this.config.dryRun,
    });

    // 主循环
    while (this.running) {
      // 暂停检查（连续错误过多时自动暂停）
      if (this.paused) {
        logger.warn(`AutoPilot 已暂停（连续 ${this.errorTracker.consecutive} 次错误），等待恢复...`);
        await this.sleep(5 * 60_000); // 暂停5分钟后重试
        this.paused = false;
        this.errorTracker.reset();
        logger.info("AutoPilot 从暂停中恢复");
      }

      try {
        await this.runCycle();
        this.errorTracker.reset(); // 成功后重置连续错误计数
      } catch (err) {
        const errMsg = (err as Error).message;
        this.errorTracker.record("cycle", errMsg, this.cycleCount);

        logger.error("AutoPilot 周期执行失败", {
          cycle: this.cycleCount,
          error: errMsg,
          consecutiveErrors: this.errorTracker.consecutive,
          totalErrors: this.errorTracker.total,
        });

        // 记录错误到审计日志
        await query(
          `INSERT INTO audit_log (event_type, severity, source, message, details)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            "autopilot_error",
            this.errorTracker.consecutive >= 3 ? "critical" : "error",
            "autopilot",
            errMsg,
            JSON.stringify({
              cycle: this.cycleCount,
              consecutive: this.errorTracker.consecutive,
              errorSummary: this.errorTracker.summarize(30),
            }),
          ]
        ).catch(() => {});

        // 连续错误阈值 → 暂停 + 告警
        if (this.errorTracker.consecutive >= this.config.maxConsecutiveErrors) {
          this.paused = true;
          await this.sendAlert(
            `AutoPilot 连续 ${this.errorTracker.consecutive} 次失败，已自动暂停`,
            "critical",
            { lastError: errMsg, errorSummary: this.errorTracker.summarize(60) },
          );
        }
      }

      // 等待下个周期（动态调整后的间隔）
      const sleepMs = this.config.dynamicCycleEnabled ? this.currentCycleMs : this.config.cycleIntervalMs;
      logger.info(`下个周期等待 ${(sleepMs / 1000).toFixed(0)}s`);
      await this.sleep(sleepMs);
    }
  }

  /**
   * 停止自动运行
   */
  stop(): void {
    logger.info("AutoPilot 正在停止...");
    this.running = false;
  }

  /**
   * 执行一个完整周期
   */
  private async runCycle(): Promise<void> {
    this.cycleCount++;
    const cycleStart = Date.now();

    logger.info(`========== AutoPilot 周期 #${this.cycleCount} ==========`);

    // 检查紧急停止开关
    const config = loadConfig();
    if (config.risk.killSwitch) {
      logger.warn("紧急停止开关已激活，跳过本周期");
      return;
    }

    // ---- Step 1: 请求 AI 引擎分析 ----
    logger.info("Step 1: 请求 AI 分析...");
    const signals = await this.getAISignals();

    if (signals.length === 0) {
      logger.info("AI 未生成任何信号，跳过执行");
    } else {
      logger.info(`AI 生成了 ${signals.length} 个信号`);

      // ---- Step 2: 执行信号 ----
      logger.info("Step 2: 执行交易信号...");
      for (const signal of signals) {
        await this.executeSignal(signal);
      }
    }

    // ---- Step 3: 定期收割归集 ----
    const now = Date.now();
    if (now - this.lastHarvestTime >= this.config.harvestIntervalMs) {
      logger.info("Step 3: 执行资金归集...");
      await this.runHarvest();
      this.lastHarvestTime = now;
    }

    // ---- Step 4: 风险检查 ----
    if (now - this.lastRiskCheckTime >= this.config.riskCheckIntervalMs) {
      logger.info("Step 4: 风险检查...");
      await this.runRiskCheck();
      this.lastRiskCheckTime = now;
    }

    // ---- Step 5: 动态调整下轮周期间隔 ----
    if (this.config.dynamicCycleEnabled) {
      await this.adjustCycleInterval();
    }

    const elapsed = Date.now() - cycleStart;
    logger.info(`周期 #${this.cycleCount} 完成，耗时 ${elapsed}ms`, {
      nextCycleMs: this.currentCycleMs,
      totalErrors: this.errorTracker.total,
    });
  }

  /**
   * 调用 AI 引擎获取策略信号
   */
  private async getAISignals(): Promise<AISignal[]> {
    try {
      // 1. 先从数据库获取最新的池子数据（包含代币地址）
      const poolsResult = await query(
        `SELECT pool_id, protocol_id, chain_id, symbol, apr_total, tvl_usd, tokens
         FROM pools
         WHERE is_active = true AND apr_total >= 1000
         ORDER BY apr_total DESC
         LIMIT 200`
      );

      // 缓存池子的代币信息
      const poolTokensMap = new Map<string, Array<{ address: string; symbol: string }>>();
      
      const pools = poolsResult.rows.map((r) => {
        // 存储代币地址信息
        if (r.tokens) {
          try {
            const tokens = typeof r.tokens === 'string' ? JSON.parse(r.tokens) : r.tokens;
            poolTokensMap.set(r.pool_id, tokens);
          } catch { /* ignore */ }
        }
        
        return {
          poolId: r.pool_id,
          protocolId: r.protocol_id,
          chain: r.chain_id,
          symbol: r.symbol,
          aprTotal: parseFloat(r.apr_total),
          tvlUsd: parseFloat(r.tvl_usd),
        };
      });

      // 2. 调用 AI 引擎
      const res = await fetch(`${this.config.aiEngineUrl}/strategy/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pools,
          total_capital_usd: this.config.totalCapitalUsd,
          current_positions: [],
        }),
      });

      if (!res.ok) {
        logger.warn(`AI 引擎返回 ${res.status}`);
        return [];
      }

      const data = await res.json() as {
        signals: AISignal[];
        totalSignals: number;
      };

      logger.info(`AI 生成了 ${data.signals?.length ?? 0} 个信号`);
      
      // 为信号添加代币地址信息
      return (data.signals || []).map(s => ({
        ...s,
        tokens: poolTokensMap.get(s.poolId) || [],
      }));
    } catch (err) {
      logger.error("AI 引擎调用失败", { error: (err as Error).message });
      return [];
    }
  }

  /**
   * 执行单个策略信号
   */
  private async executeSignal(signal: AISignal): Promise<void> {
    logger.info(`执行信号: ${signal.action} ${signal.protocolId}/${signal.poolId}`, {
      amountUsd: signal.amountUsd,
      confidence: signal.confidence,
      expectedApr: signal.expectedApr,
    });

    // 置信度检查
    if (signal.confidence < this.config.minConfidence) {
      logger.info(`置信度 ${signal.confidence} < ${this.config.minConfidence}，跳过`);
      return;
    }

    if (this.config.dryRun) {
      logger.info(`[模拟] ${signal.action}: ${signal.protocolId}/${signal.poolId} $${signal.amountUsd}`);
      return;
    }

    const adapter = adapterRegistry.get(signal.protocolId, signal.chain as Chain);
    if (!adapter) {
      logger.warn(`找不到适配器: ${signal.protocolId}@${signal.chain}`);
      return;
    }

    try {
      switch (signal.action) {
        case "enter": {
          const chain = signal.chain as Chain;
          const wethAddr = getWrappedNativeAddress(chain);
          if (!wethAddr) {
            logger.warn(`链 ${chain} 无 WETH 地址，跳过`);
            break;
          }

          // ═══ Step 0: 查询链上真实余额 ═══
          const walletAddr = this.config.walletAddress;
          const { createPublicClient, http: viemHttp } = await import("viem");
          const rpcUrl = CHAIN_CONFIGS[chain]?.rpcUrl || "https://eth.llamarpc.com";
          const publicClient = createPublicClient({ transport: viemHttp(rpcUrl) });
          const nativeBalanceWei = await publicClient.getBalance({ address: walletAddr as `0x${string}` });
          const nativeBalance = Number(nativeBalanceWei) / 1e18;
          logger.info(`链上余额: ${chain} 原生代币 = ${nativeBalance.toFixed(6)}`);

          // 保留 gas 费（Base/Arb/OP 便宜，Ethereum 贵）
          const gasReserve = chain === "ethereum" ? 0.02 : 0.003;
          const availableNative = nativeBalance - gasReserve;

          if (availableNative <= 0.001) {
            logger.warn(`${chain} 余额不足: ${nativeBalance.toFixed(6)}，保留 gas 后无可用资金，跳过`);
            break;
          }

          // 每个信号最多用可用余额的 20%，避免单笔耗尽
          const maxPerSignal = availableNative * 0.2;
          const ethToUse = Math.min(maxPerSignal, availableNative);
          const ethWei = BigInt(Math.floor(ethToUse * 1e18));

          logger.info(`本次操作使用: ${ethToUse.toFixed(6)} 原生代币 (可用 ${availableNative.toFixed(6)})`);

          // ═══ Step 1: Wrap 原生代币 → WETH ═══
          logger.info(`Wrapping ${ethToUse.toFixed(6)} → WETH on ${chain}`);
          await prepareFundsForDeposit(
            this.executor, chain,
            [{ address: wethAddr, amount: ethWei.toString() }],
            signal.amountUsd,
            walletAddr,
          );

          // ═══ Step 2: 准备池子需要的代币 ═══
          const signalTokens = signal.tokens || [];
          const depositTokens: Array<{ address: string; amount: string }> = [];
          const tokenCount = Math.max(signalTokens.length, 1);
          const wethPerToken = ethWei / BigInt(tokenCount);

          for (const t of signalTokens) {
            if (isWrappedNative(chain, t.address)) {
              depositTokens.push({ address: t.address, amount: wethPerToken.toString() });
            } else {
              // WETH → 目标代币，通过 DEX 聚合器
              try {
                // 先 approve WETH 给 DEX 路由合约
                const quote = await this.dexAggregator.getBestQuote({
                  chain,
                  tokenIn: wethAddr,
                  tokenOut: t.address,
                  amountIn: wethPerToken.toString(),
                  slippagePct: SWAP_SLIPPAGE_PCT,
                  senderAddress: walletAddr,
                });
                if (quote && quote.txPayload.data && quote.txPayload.data !== "0x") {
                  await approveTokensIfNeeded(
                    this.executor, chain,
                    [{ address: wethAddr, amount: wethPerToken.toString() }],
                    quote.txPayload.to,
                  );
                  await this.executor.execute(
                    quote.txPayload, TxType.SWAP, 0,
                    { signalId: signal.signalId, action: "auto_swap" },
                  );
                  depositTokens.push({ address: t.address, amount: quote.amountOut || wethPerToken.toString() });
                  logger.info(`兑换成功: WETH → ${t.address} via ${quote.aggregator}`);
                } else {
                  logger.warn(`无法获取 ${t.address} 报价，用 WETH 替代`);
                  depositTokens.push({ address: wethAddr, amount: wethPerToken.toString() });
                }
              } catch (swapErr) {
                logger.warn(`兑换失败: WETH → ${t.address}`, { error: (swapErr as Error).message });
                depositTokens.push({ address: wethAddr, amount: wethPerToken.toString() });
              }
            }
          }

          if (depositTokens.length === 0) {
            depositTokens.push({ address: wethAddr, amount: ethWei.toString() });
          }

          // ═══ Step 3: Approve + Deposit ═══
          const payload = await adapter.deposit({
            poolId: signal.poolId,
            tokens: depositTokens,
            recipient: walletAddr,
            slippagePct: DEFAULT_SLIPPAGE_PCT,
          });

          if (payload.to && depositTokens.length > 0) {
            await approveTokensIfNeeded(this.executor, chain, depositTokens, payload.to);
          }

          const ethPriceUsd = 2800; // TODO: 接入价格预言机
          const depositUsd = ethToUse * ethPriceUsd;
          await this.executor.execute(
            payload, TxType.DEPOSIT, depositUsd,
            { signalId: signal.signalId, action: "auto_enter" },
          );

          logger.info(`入场完成: ${signal.protocolId}/${signal.poolId} ~$${depositUsd.toFixed(0)}`);
          break;
        }

        case "exit": {
          // 查询当前持仓 LP 余额（如有），否则用 "max" 表示全部退出
          const position = await adapter.getPosition(this.config.walletAddress, signal.poolId);
          const lpAmount = position?.amountToken0?.toString() || "max";
          const payload = await adapter.withdraw({
            poolId: signal.poolId,
            lpAmount,
            recipient: this.config.walletAddress,
            slippagePct: DEFAULT_SLIPPAGE_PCT,
          });
          await this.executor.execute(
            payload, TxType.WITHDRAW, signal.amountUsd,
            { signalId: signal.signalId, action: "auto_exit" }
          );
          break;
        }

        case "compound": {
          const payloads = await adapter.compound({ poolId: signal.poolId });
          for (const p of payloads) {
            await this.executor.execute(
              p, TxType.COMPOUND, signal.amountUsd / payloads.length,
              { signalId: signal.signalId, action: "auto_compound" }
            );
          }
          break;
        }

        default:
          logger.warn(`未知操作: ${signal.action}`);
      }
    } catch (err) {
      logger.error(`信号执行失败: ${signal.signalId}`, {
        error: (err as Error).message,
      });
    }
  }

  /**
   * 执行资金归集
   */
  private async runHarvest(): Promise<void> {
    try {
      const result = await this.fundCollector.collectAll(
        this.config.walletAddress,
        this.config.activeChains,
        { dryRun: this.config.dryRun, minHarvestValueUsd: 5 }
      );

      logger.info("资金归集完成", {
        harvested: result.totalHarvested,
        collectedUsd: result.totalCollectedUsd,
        gasUsd: result.gasSpentUsd,
      });
    } catch (err) {
      logger.error("资金归集失败", { error: (err as Error).message });
    }
  }

  /**
   * 风险检查
   */
  private async runRiskCheck(): Promise<void> {
    try {
      const res = await fetch(`${this.config.aiEngineUrl}/health`);
      if (!res.ok) {
        logger.warn("AI 引擎健康检查失败");
      }

      // 检查清算风险
      // 检查止损触发
      // 检查异常情况
      // （这些由 AI 引擎的 risk_worker 处理）
    } catch (err) {
      logger.warn("风险检查失败", { error: (err as Error).message });
    }
  }

  /**
   * 动态周期调整：根据池子 APR 的波动率（标准差）自适应缩放扫描频率
   *
   * 波动大 → 缩短周期（更频繁扫描，捕捉机会/规避风险）
   * 波动小 → 延长周期（节省资源）
   */
  private async adjustCycleInterval(): Promise<void> {
    try {
      const result = await query(
        `SELECT avg(apr_total) as avg_apr, stddev(apr_total) as std_apr,
                count(*) as pool_count
         FROM pools WHERE is_active = true AND updated_at > NOW() - INTERVAL '${this.config.volatilityWindow} hours'`
      );
      const row = result.rows[0];
      if (!row || !row.avg_apr) return;

      const avgApr = parseFloat(row.avg_apr);
      const stdApr = parseFloat(row.std_apr || "0");

      // 保存 APR 历史，计算环比变化
      this.lastAprValues.push(avgApr);
      if (this.lastAprValues.length > 24) this.lastAprValues.shift();

      // 变异系数 CV = stddev / mean（归一化波动率）
      const cv = avgApr > 0 ? stdApr / avgApr : 0;

      // APR 环比变化率
      let aprChangeRate = 0;
      if (this.lastAprValues.length >= 2) {
        const prev = this.lastAprValues[this.lastAprValues.length - 2];
        aprChangeRate = prev > 0 ? Math.abs(avgApr - prev) / prev : 0;
      }

      // 综合波动率指数 (0~1)：CV权重0.6 + 环比变化权重0.4
      const volatilityIndex = Math.min(1, cv * 0.6 + aprChangeRate * 2 * 0.4);

      // 线性映射: volatilityIndex=1 → minCycle, volatilityIndex=0 → maxCycle
      const { minCycleIntervalMs, maxCycleIntervalMs } = this.config;
      const newCycle = Math.round(
        maxCycleIntervalMs - volatilityIndex * (maxCycleIntervalMs - minCycleIntervalMs)
      );

      // 平滑过渡（指数移动平均，alpha=0.3）
      this.currentCycleMs = Math.round(this.currentCycleMs * 0.7 + newCycle * 0.3);

      // 钳位
      this.currentCycleMs = Math.max(minCycleIntervalMs, Math.min(maxCycleIntervalMs, this.currentCycleMs));

      logger.info("动态周期调整", {
        avgApr: avgApr.toFixed(1),
        stdApr: stdApr.toFixed(1),
        cv: cv.toFixed(3),
        aprChangeRate: (aprChangeRate * 100).toFixed(1) + "%",
        volatilityIndex: volatilityIndex.toFixed(3),
        newCycleMs: this.currentCycleMs,
        newCycleMin: (this.currentCycleMs / 60_000).toFixed(1),
      });
    } catch (err) {
      logger.warn("波动率计算失败，保持当前周期", { error: (err as Error).message });
    }
  }

  /**
   * 发送告警通知（Webhook + 审计日志）
   */
  private async sendAlert(
    message: string,
    severity: "warning" | "critical" = "warning",
    details?: Record<string, unknown>,
  ): Promise<void> {
    logger.warn(`[ALERT:${severity}] ${message}`);

    // 写入审计日志
    await query(
      `INSERT INTO audit_log (event_type, severity, source, message, details)
       VALUES ($1, $2, $3, $4, $5)`,
      ["autopilot_alert", severity, "autopilot", message, JSON.stringify(details || {})]
    ).catch(() => {});

    // Webhook 通知
    if (this.config.alertWebhookUrl) {
      try {
        await fetch(this.config.alertWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "AutoPilot",
            severity,
            message,
            details,
            timestamp: new Date().toISOString(),
            cycle: this.cycleCount,
          }),
        });
      } catch (err) {
        logger.warn("告警 Webhook 发送失败", { error: (err as Error).message });
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ---- AI 信号类型 ----

interface AISignal {
  signalId: string;
  strategyId: string;
  action: string;
  poolId: string;
  chain: string;
  protocolId: string;
  amountUsd: number;
  reason: string;
  confidence: number;
  riskScore: number;
  expectedApr: number;
  timestamp: string;
  tokens?: Array<{ address: string; symbol: string; amount?: string }>;
}
