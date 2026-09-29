import { Hono } from "hono";
import { prisma } from "@tixing/db";
import {
  CreateTaskSchema,
  PLATFORMS,
  UpdateTaskSchema,
  type PlatformId,
} from "@tixing/shared";
import type { Queue } from "bullmq";

function assertSelectablePlatforms(platforms: PlatformId[]) {
  for (const p of platforms) {
    const meta = PLATFORMS[p];
    if (!meta) throw new Error(`未知平台: ${p}`);
    if (!meta.selectableInMvp) {
      throw new Error(`${meta.nameJa}（${meta.nameZh}）未纳入 MVP，不可选择`);
    }
  }
}

export function taskRoutes(checkQueue: Queue) {
  const app = new Hono();

  app.get("/", async (c) => {
    const tasks = await prisma.monitorTask.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        channels: { include: { channel: true } },
        _count: { select: { listings: true } },
      },
    });
    return c.json({ items: tasks });
  });

  app.get("/:id", async (c) => {
    const task = await prisma.monitorTask.findUnique({
      where: { id: c.req.param("id") },
      include: {
        channels: { include: { channel: true } },
        _count: { select: { listings: true, jobRuns: true } },
      },
    });
    if (!task) return c.json({ error: "未找到任务" }, 404);
    return c.json(task);
  });

  app.post("/", async (c) => {
    const body = CreateTaskSchema.parse(await c.req.json());
    assertSelectablePlatforms(body.platforms);
    if (body.priceMin != null && body.priceMax != null && body.priceMin > body.priceMax) {
      return c.json({ error: "最低价不能高于最高价" }, 400);
    }

    const task = await prisma.monitorTask.create({
      data: {
        name: body.name,
        platforms: body.platforms,
        keywords: body.keywords.map((k) => k.trim()).filter(Boolean),
        priceMin: body.priceMin ?? null,
        priceMax: body.priceMax ?? null,
        brand: body.brand ?? null,
        model: body.model ?? null,
        category: body.category ?? null,
        seller: body.seller ?? null,
        intervalSeconds: body.intervalSeconds,
        status: "paused",
        channels: {
          create: body.channelIds.map((channelId) => ({ channelId })),
        },
      },
      include: { channels: { include: { channel: true } } },
    });
    return c.json(task, 201);
  });

  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = UpdateTaskSchema.parse(await c.req.json());
    const existing = await prisma.monitorTask.findUnique({ where: { id } });
    if (!existing) return c.json({ error: "未找到任务" }, 404);
    if (body.platforms) assertSelectablePlatforms(body.platforms);

    const task = await prisma.$transaction(async (tx) => {
      if (body.channelIds) {
        await tx.taskChannel.deleteMany({ where: { taskId: id } });
        if (body.channelIds.length) {
          await tx.taskChannel.createMany({
            data: body.channelIds.map((channelId) => ({ taskId: id, channelId })),
          });
        }
      }
      return tx.monitorTask.update({
        where: { id },
        data: {
          name: body.name,
          platforms: body.platforms,
          keywords: body.keywords?.map((k) => k.trim()).filter(Boolean),
          priceMin: body.priceMin === undefined ? undefined : body.priceMin,
          priceMax: body.priceMax === undefined ? undefined : body.priceMax,
          brand: body.brand === undefined ? undefined : body.brand,
          model: body.model === undefined ? undefined : body.model,
          category: body.category === undefined ? undefined : body.category,
          seller: body.seller === undefined ? undefined : body.seller,
          intervalSeconds: body.intervalSeconds,
          status: body.status,
        },
        include: { channels: { include: { channel: true } } },
      });
    });
    return c.json(task);
  });

  app.post("/:id/enable", async (c) => {
    const id = c.req.param("id");
    const task = await prisma.monitorTask.update({
      where: { id },
      data: {
        status: "active",
        nextCheckAt: new Date(),
        lastError: null,
      },
    });
    await checkQueue.add(
      "check",
      { taskId: id },
      { jobId: `manual-${id}-${Date.now()}`, removeOnComplete: 100, removeOnFail: 100 },
    );
    return c.json(task);
  });

  app.post("/:id/pause", async (c) => {
    const id = c.req.param("id");
    const task = await prisma.monitorTask.update({
      where: { id },
      data: { status: "paused", nextCheckAt: null },
    });
    return c.json(task);
  });

  app.post("/:id/run", async (c) => {
    const id = c.req.param("id");
    const existing = await prisma.monitorTask.findUnique({ where: { id } });
    if (!existing) return c.json({ error: "未找到任务" }, 404);
    await checkQueue.add(
      "check",
      { taskId: id, force: true },
      { jobId: `run-${id}-${Date.now()}`, removeOnComplete: 100, removeOnFail: 100 },
    );
    return c.json({ ok: true });
  });

  app.delete("/:id", async (c) => {
    const id = c.req.param("id");
    await prisma.monitorTask.delete({ where: { id } });
    return c.json({ ok: true });
  });

  return app;
}
