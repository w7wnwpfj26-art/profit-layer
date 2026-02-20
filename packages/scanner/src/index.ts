// ============================================
// Scanner Service Entry Point
// ============================================

import {
  createLogger,
  loadConfig,
  getDbPool,
  getRedisConnection,
  closeDbPool,
  closeRedis,
} from "@profitlayer/common";
import { runPoolScan } from "./jobs/scan-pools.js";
import { runPriceScan } from "./jobs/scan-prices.js";
import { runPositionUpdate } from "./jobs/update-positions.js";
import { runAlertCheck } from "./jobs/alert-monitor.js";
import { runAnomalyCheck } from "./jobs/anomaly-detector.js";

const logger = createLogger("scanner");

async function main(): Promise<void> {
  const config = loadConfig();

  logger.info("Scanner service starting", {
    scanIntervalMs: config.scanner.intervalMs,
    minTvlUsd: config.scanner.minTvlUsd,
    minAprPct: config.scanner.minAprPct,
  });

  // Verify connections
  const db = getDbPool();
  await db.query("SELECT 1");
  logger.info("Database connection established");

  const redis = getRedisConnection();
  await redis.ping();
  logger.info("Redis connection established");

  // Run initial scan
  logger.info("Running initial pool scan...");
  await runPoolScan(config.scanner.minTvlUsd, config.scanner.minAprPct);
  await runPriceScan();
  await runPositionUpdate();

  // Schedule recurring scans
  const scanInterval = setInterval(async () => {
    try {
      logger.info("Running scheduled pool scan...");
      await runPoolScan(config.scanner.minTvlUsd, config.scanner.minAprPct);
    } catch (err) {
      logger.error("Scheduled pool scan failed", { error: (err as Error).message });
    }
  }, config.scanner.intervalMs);

  // Price scan every 60 seconds
  const priceInterval = setInterval(async () => {
    try {
      await runPriceScan();
    } catch (err) {
      logger.error("Scheduled price scan failed", { error: (err as Error).message });
    }
  }, 60_000);

  // Position value update every 5 minutes
  const positionInterval = setInterval(async () => {
    try {
      logger.info("Running scheduled position update...");
      await runPositionUpdate();
    } catch (err) {
      logger.error("Scheduled position update failed", { error: (err as Error).message });
    }
  }, 5 * 60_000);

  // Alert check every 2 minutes
  const alertInterval = setInterval(async () => {
    try {
      logger.info("Running scheduled alert check...");
      await runAlertCheck();
    } catch (err) {
      logger.error("Scheduled alert check failed", { error: (err as Error).message });
    }
  }, 2 * 60_000);

  // Run initial alert check
  await runAlertCheck();

  // Anomaly detection every 3 minutes
  const anomalyInterval = setInterval(async () => {
    try {
      logger.info("Running scheduled anomaly detection...");
      await runAnomalyCheck();
    } catch (err) {
      logger.error("Scheduled anomaly detection failed", { error: (err as Error).message });
    }
  }, 3 * 60_000);

  // Run initial anomaly check
  await runAnomalyCheck();

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Scanner service shutting down...");
    clearInterval(scanInterval);
    clearInterval(priceInterval);
    clearInterval(positionInterval);
    clearInterval(alertInterval);
    clearInterval(anomalyInterval);
    await closeDbPool();
    await closeRedis();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  logger.info("Scanner service running. Press Ctrl+C to stop.");
}

main().catch((err) => {
  logger.error("Scanner service failed to start", { error: (err as Error).message });
  process.exit(1);
});
