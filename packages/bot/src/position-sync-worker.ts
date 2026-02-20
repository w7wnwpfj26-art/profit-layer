/**
 * 持倉價格定時同步 Worker
 * 每 5 分鐘自動呼叫 /api/positions/sync 更新持倉價格
 */

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 分鐘
const DASHBOARD_API_URL = process.env.DASHBOARD_API_URL || "http://localhost:3002";

async function syncPositions(): Promise<void> {
  try {
    console.log(`[${new Date().toISOString()}] 🔄 開始同步持倉價格...`);

    const response = await fetch(`${DASHBOARD_API_URL}/api/positions/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000), // 30 秒超時
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ 同步失敗 (HTTP ${response.status}):`, error);
      return;
    }

    const result = (await response.json()) as { updated?: number; details?: { pnl?: number }[] };
    console.log(`✅ 同步完成: 更新了 ${result.updated || 0} 個持倉`);

    if (result.details && result.details.length > 0) {
      const totalPnl = result.details.reduce((sum: number, d) => sum + (d.pnl || 0), 0);
      console.log(`   總盈虧: $${totalPnl.toFixed(2)}`);
    }
  } catch (error) {
    console.error(`❌ 同步錯誤:`, (error as Error).message);
  }
}

export function startPositionSyncWorker(): void {
  console.log(`🚀 持倉同步 Worker 已啟動 (間隔: ${SYNC_INTERVAL_MS / 1000} 秒)`);
  console.log(`   Dashboard API: ${DASHBOARD_API_URL}`);

  // 立即執行一次
  syncPositions();

  // 定時執行
  setInterval(syncPositions, SYNC_INTERVAL_MS);
}
