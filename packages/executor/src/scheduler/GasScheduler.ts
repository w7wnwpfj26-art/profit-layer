// ============================================
// Gas 调度器：低 Gas 时段执行交易
// L2 链直接执行，主网等待 Gas 低于阈值
// ============================================

import {
  Chain,
  L2_CHAINS,
  CHAIN_CONFIGS,
  createLogger,
  query,
} from "@defi-yield/common";

const logger = createLogger("executor:gas-scheduler");

interface QueuedSignal {
  id: string;
  chain: Chain;
  payload: any;
  enqueuedAt: number;
  maxWaitMs: number; // 最长等待时间，超时后强制执行
}

// 默认 Gas 上限 (Gwei)
const DEFAULT_GAS_LIMITS: Record<string, number> = {
  ethereum: 30,
  bsc: 5,
};

export class GasScheduler {
  private queue: QueuedSignal[] = [];
  private gasLimits: Record<string, number> = { ...DEFAULT_GAS_LIMITS };
  private pollTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.loadGasLimits();
  }

  /** 从数据库加载 Gas 阈值配置 */
  private async loadGasLimits(): Promise<void> {
    try {
      const result = await query(
        `SELECT key, value FROM system_config WHERE key LIKE 'gas_max_gwei_%'`
      );
      for (const row of result.rows) {
        const chain = row.key.replace("gas_max_gwei_", "");
        this.gasLimits[chain] = parseFloat(row.value);
      }
      logger.info("Gas 阈值已加载", this.gasLimits);
    } catch {
      logger.warn("无法从 DB 加载 Gas 阈值，使用默认值");
    }
  }

  /** 判断当前链是否应该立即执行 */
  async shouldExecuteNow(chain: Chain): Promise<{ execute: boolean; currentGwei: number; maxGwei: number }> {
    // L2 链直接执行（Gas 极低）
    if (L2_CHAINS.has(chain)) {
      return { execute: true, currentGwei: 0, maxGwei: 0 };
    }

    // 非 EVM 链直接执行
    const config = CHAIN_CONFIGS[chain];
    if (!config?.chainIdNumeric) {
      return { execute: true, currentGwei: 0, maxGwei: 0 };
    }

    const maxGwei = this.gasLimits[chain] || 50;
    const currentGwei = await this.fetchGasPrice(chain);

    if (currentGwei <= maxGwei) {
      logger.info(`Gas OK: ${chain} 当前 ${currentGwei.toFixed(1)} Gwei ≤ 阈值 ${maxGwei} Gwei`);
      return { execute: true, currentGwei, maxGwei };
    }

    logger.info(`Gas 过高: ${chain} 当前 ${currentGwei.toFixed(1)} Gwei > 阈值 ${maxGwei} Gwei → 排队等待`);
    return { execute: false, currentGwei, maxGwei };
  }

  /** 获取当前 Gas 价格 (Gwei) */
  private async fetchGasPrice(chain: Chain): Promise<number> {
    const rpcUrl = CHAIN_CONFIGS[chain]?.rpcUrl;
    if (!rpcUrl) return 0;

    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_gasPrice", params: [], id: 1 }),
      });
      const data = await res.json() as { result?: string };
      const weiPrice = parseInt(data.result || "0", 16);
      return weiPrice / 1e9; // Wei → Gwei
    } catch (err) {
      logger.warn(`获取 ${chain} Gas 价格失败: ${(err as Error).message}`);
      return 999; // 获取失败时返回高值，避免盲目执行
    }
  }

  /** 将信号加入等待队列 */
  enqueue(signal: QueuedSignal): void {
    this.queue.push(signal);
    logger.info(`信号入队: ${signal.id} (${signal.chain})，当前队列长度: ${this.queue.length}`);

    // 启动轮询（如果还没启动）
    if (!this.pollTimer) {
      this.pollTimer = setInterval(() => this.processQueue(), 60_000); // 每分钟检查
      logger.info("Gas 调度器轮询已启动（每 60 秒）");
    }
  }

  /** 处理等待队列 */
  async processQueue(): Promise<QueuedSignal[]> {
    if (this.queue.length === 0) return [];

    const readyToExecute: QueuedSignal[] = [];
    const remaining: QueuedSignal[] = [];
    const now = Date.now();

    for (const signal of this.queue) {
      const { execute } = await this.shouldExecuteNow(signal.chain);
      const expired = (now - signal.enqueuedAt) > signal.maxWaitMs;

      if (execute || expired) {
        if (expired) logger.warn(`信号 ${signal.id} 等待超时，强制执行`);
        readyToExecute.push(signal);
      } else {
        remaining.push(signal);
      }
    }

    this.queue = remaining;

    if (readyToExecute.length > 0) {
      logger.info(`Gas 调度: ${readyToExecute.length} 个信号可执行，${remaining.length} 个继续等待`);
    }

    // 队列清空后停止轮询
    if (this.queue.length === 0 && this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    return readyToExecute;
  }

  /** 获取当前队列状态 */
  getQueueStatus(): { length: number; signals: { id: string; chain: string; waitingSec: number }[] } {
    const now = Date.now();
    return {
      length: this.queue.length,
      signals: this.queue.map(s => ({
        id: s.id,
        chain: s.chain,
        waitingSec: Math.floor((now - s.enqueuedAt) / 1000),
      })),
    };
  }
}
