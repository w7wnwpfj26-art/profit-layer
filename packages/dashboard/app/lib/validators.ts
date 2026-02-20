/**
 * 配置项输入验证器
 */
type ValidationResult = { valid: boolean; error: string | null };

export const configValidators: Record<string, (v: string) => ValidationResult> = {
  deepseek_api_key: (v) => {
    if (!v) return { valid: true, error: null };
    if (!v.startsWith("sk-")) return { valid: false, error: "API Key 必须以 sk- 开头" };
    if (v.length < 20) return { valid: false, error: "API Key 长度不足" };
    return { valid: true, error: null };
  },

  total_capital_usd: (v) => {
    const n = parseFloat(v);
    if (isNaN(n)) return { valid: false, error: "必须是有效数字" };
    if (n < 0) return { valid: false, error: "不能为负数" };
    if (n > 10_000_000) return { valid: false, error: "超出最大限额 $10M" };
    return { valid: true, error: null };
  },

  max_single_tx_usd: (v) => {
    const n = parseFloat(v);
    if (isNaN(n)) return { valid: false, error: "必须是有效数字" };
    if (n < 0) return { valid: false, error: "不能为负数" };
    if (n > 1_000_000) return { valid: false, error: "超出最大限额 $1M" };
    return { valid: true, error: null };
  },

  max_daily_tx_usd: (v) => {
    const n = parseFloat(v);
    if (isNaN(n)) return { valid: false, error: "必须是有效数字" };
    if (n < 0) return { valid: false, error: "不能为负数" };
    return { valid: true, error: null };
  },

  stop_loss_pct: (v) => {
    const n = parseFloat(v);
    if (isNaN(n)) return { valid: false, error: "必须是有效数字" };
    if (n < 0 || n > 100) return { valid: false, error: "必须在 0-100 之间" };
    return { valid: true, error: null };
  },

  min_health_score: (v) => {
    const n = parseFloat(v);
    if (isNaN(n)) return { valid: false, error: "必须是有效数字" };
    if (n < 0 || n > 100) return { valid: false, error: "必须在 0-100 之间" };
    return { valid: true, error: null };
  },

  max_risk_score: (v) => {
    const n = parseFloat(v);
    if (isNaN(n)) return { valid: false, error: "必须是有效数字" };
    if (n < 0 || n > 100) return { valid: false, error: "必须在 0-100 之间" };
    return { valid: true, error: null };
  },

  rebalance_threshold_pct: (v) => {
    const n = parseFloat(v);
    if (isNaN(n)) return { valid: false, error: "必须是有效数字" };
    if (n < 0 || n > 100) return { valid: false, error: "必须在 0-100 之间" };
    return { valid: true, error: null };
  },

  scan_interval_min: (v) => {
    const n = parseFloat(v);
    if (isNaN(n)) return { valid: false, error: "必须是有效数字" };
    if (n < 1) return { valid: false, error: "至少 1 分钟" };
    if (n > 1440) return { valid: false, error: "不能超过 24 小时" };
    return { valid: true, error: null };
  },

  evm_wallet_address: (v) => {
    if (!v) return { valid: true, error: null };
    if (!/^0x[a-fA-F0-9]{40}$/.test(v)) return { valid: false, error: "无效的 EVM 地址格式" };
    return { valid: true, error: null };
  },

  aptos_wallet_address: (v) => {
    if (!v) return { valid: true, error: null };
    if (!/^0x[a-fA-F0-9]{1,64}$/.test(v)) return { valid: false, error: "无效的 Aptos 地址格式" };
    return { valid: true, error: null };
  },

  solana_wallet_address: (v) => {
    if (!v) return { valid: true, error: null };
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) return { valid: false, error: "无效的 Solana 地址格式" };
    return { valid: true, error: null };
  },
};
