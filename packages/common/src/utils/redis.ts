// ============================================
// Redis Connection & BullMQ Helpers
// ============================================

import { Queue, Worker, type Processor, type WorkerOptions, type QueueOptions } from "bullmq";
import IORedis from "ioredis";

let connection: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}

export function createQueue(name: string, opts?: Partial<QueueOptions>): Queue {
  return new Queue(name, {
    connection: getRedisConnection(),
    ...opts,
  });
}

export function createWorker<T = unknown>(
  name: string,
  processor: Processor<T>,
  opts?: Partial<WorkerOptions>
): Worker<T> {
  return new Worker<T>(name, processor, {
    connection: getRedisConnection(),
    concurrency: 5,
    ...opts,
  });
}

export async function closeRedis(): Promise<void> {
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
