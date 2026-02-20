/**
 * Telegram 通知服务
 * 支持发送告警、交易通知、策略执行报告等
 */

import { getPool } from "./db";

const pool = getPool();

interface TelegramConfig {
  botToken: string;
  chatId: string;
}

// 从数据库获取 Telegram 配置
async function getTelegramConfig(): Promise<TelegramConfig | null> {
  try {
    const result = await pool.query(
      `SELECT key, value FROM system_config WHERE key IN ('telegram_bot_token', 'telegram_chat_id')`
    );
    
    const config: Record<string, string> = {};
    for (const row of result.rows) {
      config[row.key] = row.value;
    }
    
    if (!config.telegram_bot_token || !config.telegram_chat_id) {
      return null;
    }
    
    return {
      botToken: config.telegram_bot_token,
      chatId: config.telegram_chat_id,
    };
  } catch {
    return null;
  }
}

// 发送 Telegram 消息
export async function sendTelegramMessage(
  message: string,
  options?: { parseMode?: "HTML" | "Markdown"; silent?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const config = await getTelegramConfig();
  
  if (!config) {
    return { success: false, error: "Telegram 未配置" };
  }
  
  try {
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: message,
        parse_mode: options?.parseMode || "HTML",
        disable_notification: options?.silent || false,
      }),
    });
    
    const data = await response.json();
    
    if (!data.ok) {
      return { success: false, error: data.description || "发送失败" };
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// 预定义的通知模板
export const TelegramTemplates = {
  // 紧急告警
  emergency: (title: string, detail: string) => 
    `🚨 <b>紧急告警</b>\n\n<b>${title}</b>\n${detail}\n\n⏰ ${new Date().toLocaleString("zh-CN")}`,
  
  // 策略执行通知
  strategyExecuted: (strategy: string, pool: string, amount: string, txHash?: string) =>
    `✅ <b>策略执行成功</b>\n\n` +
    `📌 策略: ${strategy}\n` +
    `🏊 池子: ${pool}\n` +
    `💰 金额: ${amount}\n` +
    (txHash ? `🔗 TX: <code>${txHash}</code>\n` : "") +
    `⏰ ${new Date().toLocaleString("zh-CN")}`,
  
  // 风险预警
  riskAlert: (type: string, detail: string, suggestion: string) =>
    `⚠️ <b>风险预警</b>\n\n` +
    `📌 类型: ${type}\n` +
    `📝 详情: ${detail}\n` +
    `💡 建议: ${suggestion}\n` +
    `⏰ ${new Date().toLocaleString("zh-CN")}`,
  
  // 利润归集通知
  profitSwept: (amount: string, from: string, to: string, txHash: string) =>
    `💸 <b>利润已归集</b>\n\n` +
    `💰 金额: ${amount}\n` +
    `📤 从: <code>${from}</code>\n` +
    `📥 至: <code>${to}</code>\n` +
    `🔗 TX: <code>${txHash}</code>\n` +
    `⏰ ${new Date().toLocaleString("zh-CN")}`,
  
  // 系统状态变更
  systemStatus: (status: "started" | "stopped" | "paused", reason?: string) => {
    const icons = { started: "🟢", stopped: "🔴", paused: "🟡" };
    const labels = { started: "系统已启动", stopped: "系统已停止", paused: "系统已暂停" };
    return `${icons[status]} <b>${labels[status]}</b>\n` +
      (reason ? `\n📝 原因: ${reason}\n` : "") +
      `⏰ ${new Date().toLocaleString("zh-CN")}`;
  },
  
  // 每日收益报告
  dailyReport: (data: { totalProfit: string; trades: number; bestPool: string; riskEvents: number }) =>
    `📊 <b>每日收益报告</b>\n\n` +
    `💰 总收益: ${data.totalProfit}\n` +
    `📈 交易次数: ${data.trades}\n` +
    `🏆 最佳池子: ${data.bestPool}\n` +
    `⚠️ 风险事件: ${data.riskEvents}\n` +
    `⏰ ${new Date().toLocaleString("zh-CN")}`,
};

// 快捷发送方法
export const notify = {
  emergency: (title: string, detail: string) => 
    sendTelegramMessage(TelegramTemplates.emergency(title, detail)),
  
  strategyExecuted: (strategy: string, pool: string, amount: string, txHash?: string) =>
    sendTelegramMessage(TelegramTemplates.strategyExecuted(strategy, pool, amount, txHash)),
  
  riskAlert: (type: string, detail: string, suggestion: string) =>
    sendTelegramMessage(TelegramTemplates.riskAlert(type, detail, suggestion)),
  
  profitSwept: (amount: string, from: string, to: string, txHash: string) =>
    sendTelegramMessage(TelegramTemplates.profitSwept(amount, from, to, txHash)),
  
  systemStatus: (status: "started" | "stopped" | "paused", reason?: string) =>
    sendTelegramMessage(TelegramTemplates.systemStatus(status, reason)),
  
  dailyReport: (data: { totalProfit: string; trades: number; bestPool: string; riskEvents: number }) =>
    sendTelegramMessage(TelegramTemplates.dailyReport(data)),
};
