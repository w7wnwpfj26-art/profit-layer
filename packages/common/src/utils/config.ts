// ============================================
// Centralized Configuration
// ============================================

import dotenv from "dotenv";

dotenv.config();

export interface AppConfig {
  // Database
  postgres: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  // Redis
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  // Scanner
  scanner: {
    intervalMs: number;
    minTvlUsd: number;
    minAprPct: number;
  };
  // Risk Management
  risk: {
    maxSingleTxUsd: number;
    maxDailyTxUsd: number;
    stopLossPct: number;
    killSwitch: boolean;
  };
  // AI Engine
  aiEngine: {
    host: string;
    port: number;
  };
}

export function loadConfig(): AppConfig {
  return {
    postgres: {
      host: process.env.POSTGRES_HOST || "localhost",
      port: parseInt(process.env.POSTGRES_PORT || "5433"),
      database: process.env.POSTGRES_DB || "defi_yield",
      user: process.env.POSTGRES_USER || "defi",
      password: process.env.POSTGRES_PASSWORD || "change_me_in_production",
    },
    redis: {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      password: process.env.REDIS_PASSWORD || undefined,
    },
    scanner: {
      intervalMs: parseInt(process.env.SCAN_INTERVAL_MS || "300000"),
      minTvlUsd: parseFloat(process.env.MIN_TVL_USD || "100000"),
      minAprPct: parseFloat(process.env.MIN_APR_PCT || "1.0"),
    },
    risk: {
      maxSingleTxUsd: parseFloat(process.env.MAX_SINGLE_TX_USD || "10000"),
      maxDailyTxUsd: parseFloat(process.env.MAX_DAILY_TX_USD || "50000"),
      stopLossPct: parseFloat(process.env.STOP_LOSS_PCT || "10"),
      killSwitch: process.env.KILL_SWITCH === "true",
    },
    aiEngine: {
      host: process.env.AI_ENGINE_HOST || "localhost",
      port: parseInt(process.env.AI_ENGINE_PORT || "8000"),
    },
  };
}
