import { Queue } from "bullmq";
import { Redis } from "ioredis";

export const CHECK_QUEUE = "task-checks";

export function createRedis(url: string) {
  return new Redis(url, { maxRetriesPerRequest: null });
}

export function createCheckQueue(connection: Redis) {
  return new Queue(CHECK_QUEUE, { connection });
}
