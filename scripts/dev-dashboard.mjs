#!/usr/bin/env node
/**
 * Dashboard 启动 + 健康检查脚本
 * 用法: node scripts/dev-dashboard.mjs
 *
 * 功能:
 * - 启动 dashboard dev server
 * - 自动检测端口是否就绪
 * - 探测关键 API 端点
 * - 防止多进程端口冲突
 */

import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.DASHBOARD_PORT || 3002;
const HOST = "127.0.0.1";
const BASE = `http://${HOST}:${PORT}`;
const MAX_WAIT_S = 30;

// 关键 API 端点
const HEALTH_ENDPOINTS = [
  { path: "/api/ops", name: "运维监控" },
  { path: "/api/positions", name: "持仓" },
  { path: "/api/alerts", name: "告警" },
];

// 检查端口是否被占用
function isPortInUse() {
  try {
    execSync(`lsof -i :${PORT} -t 2>/dev/null`, { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}

// 探测单个端点
async function probe(endpoint) {
  try {
    const res = await fetch(`${BASE}${endpoint.path}`, {
      signal: AbortSignal.timeout(5000),
    });
    return { ...endpoint, status: res.status, ok: res.ok };
  } catch {
    return { ...endpoint, status: 0, ok: false };
  }
}

// 等待服务就绪
async function waitForReady() {
  for (let i = 0; i < MAX_WAIT_S; i++) {
    try {
      const res = await fetch(`${BASE}/api/ops`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    process.stdout.write(".");
    await sleep(1000);
  }
  return false;
}

async function main() {
  console.log(`\n🚀 Dashboard Dev Launcher`);
  console.log(`   Port: ${PORT}  Host: ${HOST}\n`);

  // 1. 检查端口冲突
  if (isPortInUse()) {
    console.log(`⚠️  端口 ${PORT} 已被占用`);
    try {
      const pid = execSync(`lsof -i :${PORT} -t 2>/dev/null`, { encoding: "utf8" }).trim();
      console.log(`   PID: ${pid}`);
      console.log(`   如需强制重启，运行: kill ${pid} && node scripts/dev-dashboard.mjs\n`);
    } catch { /* ignore */ }

    // 直接做健康检查
    console.log("📡 检测现有服务健康状态...\n");
    const results = await Promise.all(HEALTH_ENDPOINTS.map(probe));
    for (const r of results) {
      const icon = r.ok ? "✅" : "❌";
      console.log(`   ${icon} ${r.name.padEnd(8)} ${r.path.padEnd(20)} → ${r.status || "unreachable"}`);
    }
    const allOk = results.every((r) => r.ok);
    console.log(allOk ? "\n✅ 所有端点正常\n" : "\n⚠️  部分端点异常，建议重启\n");
    process.exit(allOk ? 0 : 1);
  }

  // 2. 启动 dev server
  console.log("🔧 启动 Next.js dev server...");
  const child = spawn("npx", ["next", "dev", "-H", "0.0.0.0", "-p", String(PORT)], {
    cwd: new URL("../packages/dashboard", import.meta.url).pathname,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(PORT) },
  });

  child.stdout.on("data", (d) => {
    const line = d.toString().trim();
    if (line) console.log(`   ${line}`);
  });
  child.stderr.on("data", (d) => {
    const line = d.toString().trim();
    if (line && !line.includes("ExperimentalWarning")) console.log(`   ${line}`);
  });

  child.on("exit", (code) => {
    if (code !== 0) {
      console.error(`\n❌ Dev server 异常退出 (code: ${code})`);
      process.exit(1);
    }
  });

  // 3. 等待就绪
  process.stdout.write("\n⏳ 等待服务就绪");
  const ready = await waitForReady();

  if (!ready) {
    console.log("\n\n❌ 服务启动超时，请检查日志");
    child.kill();
    process.exit(1);
  }

  // 4. 健康检查
  console.log("\n\n📡 健康检查:\n");
  const results = await Promise.all(HEALTH_ENDPOINTS.map(probe));
  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    console.log(`   ${icon} ${r.name.padEnd(8)} ${r.path.padEnd(20)} → ${r.status}`);
  }

  const allOk = results.every((r) => r.ok);
  console.log(allOk
    ? `\n✅ Dashboard 就绪: ${BASE}\n`
    : `\n⚠️  部分端点异常，但服务已启动: ${BASE}\n`
  );

  // 保持进程运行
  process.on("SIGINT", () => {
    console.log("\n🛑 正在关闭 Dashboard...");
    child.kill();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    child.kill();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("启动失败:", err);
  process.exit(1);
});
