// ============================================
// Structured Logger
// ============================================

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
};

const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  DEBUG: LogLevel.DEBUG,
  INFO: LogLevel.INFO,
  WARN: LogLevel.WARN,
  ERROR: LogLevel.ERROR,
};
const currentLevel: LogLevel =
  LOG_LEVEL_MAP[process.env.LOG_LEVEL?.toUpperCase() ?? ""] ?? LogLevel.INFO;

export function createLogger(service: string) {
  function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
    if (level < currentLevel) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level: LOG_LEVEL_NAMES[level],
      service,
      message,
      ...meta,
    };

    const output = JSON.stringify(entry);

    if (level >= LogLevel.ERROR) {
      console.error(output);
    } else if (level >= LogLevel.WARN) {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  return {
    debug: (msg: string, meta?: Record<string, unknown>) => log(LogLevel.DEBUG, msg, meta),
    info: (msg: string, meta?: Record<string, unknown>) => log(LogLevel.INFO, msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => log(LogLevel.WARN, msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => log(LogLevel.ERROR, msg, meta),
  };
}

export type Logger = ReturnType<typeof createLogger>;
