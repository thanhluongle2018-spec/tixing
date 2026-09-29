import { Worker, Queue } from "bullmq";
import { Redis } from "ioredis";
import { z } from "zod";
import { prisma } from "@tixing/db";
import { ConcurrencyGate, RateLimiter, runTaskCheck } from "@tixing/core";

const EnvSchema = z.object({
  REDIS_URL: z.string().default("redis://localhost:6379"),
  DATABASE_URL: z.string().min(1),
  WORKER_CONCURRENCY: z.coerce.number().default(2),
  CHECK_TICK_MS: z.coerce.number().default(15_000),
  NOTIFY_MAX_ATTEMPTS: z.coerce.number().default(3),
});

const env = EnvSchema.parse(process.env);
const CHECK_QUEUE = "task-checks";

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue(CHECK_QUEUE, { connection });
const globalGate = new ConcurrencyGate(env.WORKER_CONCURRENCY);
const platformLimiter = new RateLimiter(10, 2);

const worker = new Worker(
  CHECK_QUEUE,
  async (job) => {
    const taskId = String(job.data.taskId);
    const force = Boolean(job.data.force);
    console.log(`[worker] check task=${taskId} force=${force} job=${job.id}`);
    return runTaskCheck(taskId, {
      prisma,
      globalGate,
      platformLimiter,
      notifyMaxAttempts: env.NOTIFY_MAX_ATTEMPTS,
      force,
    });
  },
  {
    connection,
    concurrency: env.WORKER_CONCURRENCY,
  },
);

worker.on("failed", (job, err) => {
  console.error(`[worker] failed job=${job?.id}`, err.message);
});

async function enqueueDueTasks() {
  const due = await prisma.monitorTask.findMany({
    where: {
      status: "active",
      OR: [{ nextCheckAt: null }, { nextCheckAt: { lte: new Date() } }],
    },
    select: { id: true },
    take: 50,
  });

  for (const task of due) {
    await queue.add(
      "check",
      { taskId: task.id },
      {
        jobId: `due-${task.id}-${Math.floor(Date.now() / env.CHECK_TICK_MS)}`,
        removeOnComplete: 200,
        removeOnFail: 200,
      },
    );
  }
  if (due.length) {
    console.log(`[scheduler] enqueued ${due.length} due task(s)`);
  }
}

const tick = setInterval(() => {
  enqueueDueTasks().catch((err) => console.error("[scheduler]", err));
}, env.CHECK_TICK_MS);

enqueueDueTasks().catch((err) => console.error("[scheduler]", err));

console.log(
  `Worker started concurrency=${env.WORKER_CONCURRENCY} tick=${env.CHECK_TICK_MS}ms`,
);

async function shutdown() {
  clearInterval(tick);
  await worker.close();
  await queue.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
