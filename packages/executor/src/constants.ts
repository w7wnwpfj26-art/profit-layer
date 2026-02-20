/**
 * Executor 全局常量
 * 可通过环境变量覆盖
 */

/** 默认滑点（deposit/withdraw/rebalance），减少 SlippageExceeded 失败 */
export const DEFAULT_SLIPPAGE_PCT = parseFloat(process.env.EXECUTOR_SLIPPAGE_PCT || "2.0");

/** Swap 兑换滑点（DEX 聚合器报价） */
export const SWAP_SLIPPAGE_PCT = parseFloat(process.env.EXECUTOR_SWAP_SLIPPAGE_PCT || "1.5");
