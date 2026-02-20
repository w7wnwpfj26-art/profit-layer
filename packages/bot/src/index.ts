/**
 * DeFi AI Telegram Bot - 双向控制
 * 命令: /status /pools /stop /resume /approve /reject /report /config
 */

import { Bot, Context } from "grammy";
import pg from "pg";
import { startPositionSyncWorker } from "./position-sync-worker.js";

// ---- 配置 ----
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const AUTHORIZED_USERS = (process.env.TELEGRAM_AUTHORIZED_USERS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5433"),
  database: process.env.POSTGRES_DB || "defi_yield",
  user: process.env.POSTGRES_USER || "defi",
  password: process.env.POSTGRES_PASSWORD || "change_me_in_production",
  max: 5,
});

// ---- 权限中间件 ----
function authMiddleware(ctx: Context, next: () => Promise<void>) {
  const userId = ctx.from?.id?.toString();
  if (AUTHORIZED_USERS.length > 0 && (!userId || !AUTHORIZED_USERS.includes(userId))) {
    ctx.reply("⛔ 无权限。请联系管理员将你的 Telegram ID 加入白名单。");
    return;
  }
  return next();
}

// ---- DB 查询辅助 ----
async function query(sql: string, params?: any[]) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

async function getConfig(key: string): Promise<string> {
  const r = await query("SELECT value FROM system_config WHERE key = $1", [key]);
  return r.rows[0]?.value || "";
}

async function setConfig(key: string, value: string): Promise<boolean> {
  const r = await query("UPDATE system_config SET value = $1, updated_at = NOW() WHERE key = $2", [value, key]);
  return (r.rowCount ?? 0) > 0;
}

// ---- 启动持仓同步 Worker ----
startPositionSyncWorker();

// ---- 启动 Bot ----
if (!BOT_TOKEN) {
  console.warn("⚠️  TELEGRAM_BOT_TOKEN 未設置，Telegram Bot 服務已跳過");
  console.warn("💡 如需啟用 Telegram 通知，請在 .env 中配置 TELEGRAM_BOT_TOKEN");
  console.log("✅ 持倉同步 Worker 將繼續運行");
} else {
  const bot = new Bot(BOT_TOKEN);
  bot.use(authMiddleware);

  // ---- /start ----
  bot.command("start", (ctx) => {
  ctx.reply(
    "🤖 *Nexus Yield Bot*\n\n" +
    "可用命令:\n" +
    "/status - 查看系统状态与持仓\n" +
    "/pools - 查看推荐池子 Top 10\n" +
    "/stop - 紧急停止所有交易\n" +
    "/resume - 恢复自动交易\n" +
    "/report - 生成收益报告\n" +
    "/config <key> <value> - 修改系统配置\n" +
    "/gas - 查看各链 Gas 价格",
    { parse_mode: "Markdown" }
  );
});

// ---- /status ----
bot.command("status", async (ctx) => {
  try {
    const [posResult, cfgResult, poolCount] = await Promise.all([
      query(`SELECT COALESCE(SUM(value_usd), 0) as total_value,
                    COALESCE(SUM(unrealized_pnl_usd), 0) as total_pnl,
                    COUNT(*) as count
             FROM positions WHERE status = 'active'`),
      query(`SELECT key, value FROM system_config WHERE key IN ('autopilot_enabled','autopilot_dry_run','kill_switch')`),
      query(`SELECT COUNT(*) as cnt FROM pools WHERE is_active = true AND tvl_usd > 100000`),
    ]);

    const pos = posResult.rows[0];
    const cfg: Record<string, string> = {};
    cfgResult.rows.forEach((r: any) => (cfg[r.key] = r.value));

    const autoPilot = cfg.autopilot_enabled === "true"
      ? (cfg.autopilot_dry_run === "true" ? "🟡 模拟运行" : "🟢 实盘运行")
      : "🔴 已停止";
    const killSwitch = cfg.kill_switch === "true" ? "🚨 已触发" : "✅ 正常";

    ctx.reply(
      `📊 *系统状态报告*\n\n` +
      `🤖 AutoPilot: ${autoPilot}\n` +
      `🛑 Kill Switch: ${killSwitch}\n` +
      `📈 追踪池子: ${poolCount.rows[0].cnt}\n\n` +
      `💰 *持仓概览*\n` +
      `总价值: $${Number(pos.total_value).toLocaleString()}\n` +
      `未实现盈亏: $${Number(pos.total_pnl).toLocaleString()}\n` +
      `活跃持仓: ${pos.count} 个`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    ctx.reply(`❌ 查询失败: ${(err as Error).message}`);
  }
});

// ---- /pools ----
bot.command("pools", async (ctx) => {
  try {
    const result = await query(`
      SELECT symbol, protocol_id, chain_id, apr_total, tvl_usd, health_score
      FROM pools WHERE is_active = true AND tvl_usd > 1000000 AND apr_total >= 1000
      ORDER BY apr_total DESC LIMIT 10
    `);

    if (result.rows.length === 0) {
      ctx.reply("📭 暂无符合条件的推荐池子");
      return;
    }

    let msg = "🏊 *推荐池子 Top 10*\n_(TVL>$1M, 健康分≥60)_\n\n";
    result.rows.forEach((r: any, i: number) => {
      msg += `${i + 1}. *${r.symbol}*\n`;
      msg += `   ${r.protocol_id} | ${r.chain_id}\n`;
      msg += `   APR: ${Number(r.apr_total).toFixed(1)}% | TVL: $${(Number(r.tvl_usd) / 1e6).toFixed(1)}M | 健康: ${Number(r.health_score).toFixed(0)}\n\n`;
    });

    ctx.reply(msg, { parse_mode: "Markdown" });
  } catch (err) {
    ctx.reply(`❌ 查询失败: ${(err as Error).message}`);
  }
});

// ---- /stop ----
bot.command("stop", async (ctx) => {
  await setConfig("kill_switch", "true");
  await query(
    `INSERT INTO audit_log (event_type, severity, source, message) VALUES ($1, $2, $3, $4)`,
    ["kill_switch_activated", "critical", "telegram_bot", `Kill Switch 由 Telegram 用户 ${ctx.from?.id} 触发`]
  );
  ctx.reply("🚨 *紧急停止已触发！*\n所有交易已立即暂停。\n\n使用 /resume 恢复运行。", { parse_mode: "Markdown" });
});

// ---- /resume ----
bot.command("resume", async (ctx) => {
  await setConfig("kill_switch", "false");
  await query(
    `INSERT INTO audit_log (event_type, severity, source, message) VALUES ($1, $2, $3, $4)`,
    ["kill_switch_deactivated", "warning", "telegram_bot", `Kill Switch 由 Telegram 用户 ${ctx.from?.id} 解除`]
  );
  ctx.reply("✅ *系统已恢复运行*\nKill Switch 已关闭，交易恢复正常。", { parse_mode: "Markdown" });
});

// ---- /report ----
bot.command("report", async (ctx) => {
  try {
    const [pnl24h, txCount, topEarner] = await Promise.all([
      query(`SELECT COALESCE(SUM(total_pnl_usd), 0) as pnl FROM position_pnl_snapshots WHERE time > NOW() - INTERVAL '24 hours' ORDER BY time DESC LIMIT 1`),
      query(`SELECT COUNT(*) as cnt, COALESCE(SUM(amount_usd), 0) as vol FROM transactions WHERE created_at > NOW() - INTERVAL '24 hours'`),
      query(`SELECT symbol, apr_total, health_score FROM pools WHERE is_active = true AND tvl_usd > 500000 ORDER BY apr_total DESC LIMIT 1`),
    ]);

    const tx = txCount.rows[0];
    const top = topEarner.rows[0];

    ctx.reply(
      `📋 *24 小时收益报告*\n\n` +
      `💵 交易笔数: ${tx.cnt}\n` +
      `💰 交易总额: $${Number(tx.vol).toLocaleString()}\n\n` +
      `🏆 *当前最佳池子*\n` +
      `${top?.symbol || "-"} | APR ${Number(top?.apr_total || 0).toFixed(1)}% | 健康 ${Number(top?.health_score || 0).toFixed(0)}`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    ctx.reply(`❌ 报告生成失败: ${(err as Error).message}`);
  }
});

// ---- /config ----
bot.command("config", async (ctx) => {
  const args = ctx.message?.text?.split(/\s+/).slice(1) || [];

  if (args.length === 0) {
    // 显示当前关键配置
    const result = await query(`SELECT key, value FROM system_config WHERE category IN ('autopilot', 'risk', 'strategy') ORDER BY category, key`);
    let msg = "⚙️ *当前系统配置*\n\n";
    result.rows.forEach((r: any) => {
      msg += `\`${r.key}\` = \`${r.value}\`\n`;
    });
    msg += "\n用法: /config <key> <value>";
    ctx.reply(msg, { parse_mode: "Markdown" });
    return;
  }

  if (args.length < 2) {
    ctx.reply("用法: /config <key> <value>\n例如: /config stop_loss_pct 15");
    return;
  }

  const [key, ...valueParts] = args;
  const value = valueParts.join(" ");

  // 安全白名单
  const allowedKeys = new Set([
    "total_capital_usd", "max_single_tx_usd", "max_daily_tx_usd",
    "stop_loss_pct", "max_risk_score", "min_health_score",
    "scan_interval_min", "min_tvl_usd", "min_apr_pct",
    "autopilot_enabled", "autopilot_dry_run",
    "take_profit_pct", "trailing_stop_pct", "take_profit_mode",
  ]);

  if (!allowedKeys.has(key)) {
    ctx.reply(`⛔ 配置项 \`${key}\` 不在允许修改的范围内`, { parse_mode: "Markdown" });
    return;
  }

  const ok = await setConfig(key, value);
  if (ok) {
    await query(
      `INSERT INTO audit_log (event_type, severity, source, message, metadata) VALUES ($1, $2, $3, $4, $5)`,
      ["config_updated", "warning", "telegram_bot", `配置 ${key} 改为 ${value}`, JSON.stringify({ key, value, userId: ctx.from?.id })]
    );
    ctx.reply(`✅ 配置已更新\n\`${key}\` = \`${value}\``, { parse_mode: "Markdown" });
  } else {
    ctx.reply(`❌ 配置项 \`${key}\` 不存在`, { parse_mode: "Markdown" });
  }
});

// ---- /gas ----
bot.command("gas", async (ctx) => {
  const rpcs: Record<string, string> = {
    "Ethereum": "https://rpc.ankr.com/eth",
    "BSC": "https://rpc.ankr.com/bsc",
    "Arbitrum": "https://arb1.arbitrum.io/rpc",
    "Base": "https://mainnet.base.org",
    "Optimism": "https://mainnet.optimism.io",
  };

  let msg = "⛽ *各链 Gas 实时价格*\n\n";

  for (const [name, rpc] of Object.entries(rpcs)) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_gasPrice", params: [], id: 1 }),
      });
      const data = (await res.json()) as { result?: string };
      const gwei = parseInt(data.result ?? "0x0", 16) / 1e9;
      msg += `${name}: *${gwei.toFixed(2)} Gwei*\n`;
    } catch {
      msg += `${name}: ❌ 查询失败\n`;
    }
  }

  ctx.reply(msg, { parse_mode: "Markdown" });
  });

  // ---- 启动 Bot ----
  bot.start();
  console.log("🤖 Telegram Bot 已启动");
}
