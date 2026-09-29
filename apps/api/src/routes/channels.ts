import { Hono } from "hono";
import { prisma } from "@tixing/db";
import { CreateChannelSchema, UpdateChannelSchema } from "@tixing/shared";
import { getNotifyAdapter } from "@tixing/core";

function redactConfig(config: Record<string, unknown>) {
  const copy: Record<string, unknown> = { ...config };
  if (typeof copy.botToken === "string" && copy.botToken) {
    copy.botToken = "***";
  }
  if (typeof copy.deviceKey === "string" && copy.deviceKey) {
    const key = copy.deviceKey;
    copy.deviceKey = key.length <= 4 ? "***" : `${key.slice(0, 2)}***${key.slice(-2)}`;
  }
  return copy;
}

function toPublicChannel(ch: {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  config: unknown;
}) {
  return {
    id: ch.id,
    name: ch.name,
    type: ch.type,
    enabled: ch.enabled,
    createdAt: ch.createdAt,
    updatedAt: ch.updatedAt,
    config: redactConfig(ch.config as Record<string, unknown>),
  };
}

export function channelRoutes() {
  const app = new Hono();

  app.get("/", async (c) => {
    const items = await prisma.notificationChannel.findMany({ orderBy: { createdAt: "desc" } });
    return c.json({ items: items.map(toPublicChannel) });
  });

  app.post("/", async (c) => {
    const body = CreateChannelSchema.parse(await c.req.json());
    if (body.type === "telegram" && !body.config.chatId) {
      return c.json({ error: "Telegram 需要 chatId" }, 400);
    }
    if (body.type === "telegram" && !body.config.botToken && !process.env.TELEGRAM_BOT_TOKEN) {
      return c.json({ error: "Telegram 需要 botToken（渠道配置或环境变量）" }, 400);
    }
    if (body.type === "bark" && !body.config.deviceKey) {
      return c.json({ error: "Bark 需要 deviceKey" }, 400);
    }
    const channel = await prisma.notificationChannel.create({
      data: {
        name: body.name,
        type: body.type,
        config: body.config,
        enabled: body.enabled,
      },
    });
    return c.json(toPublicChannel(channel), 201);
  });

  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = UpdateChannelSchema.parse(await c.req.json());
    const channel = await prisma.notificationChannel.update({
      where: { id },
      data: {
        name: body.name,
        type: body.type,
        config: body.config,
        enabled: body.enabled,
      },
    });
    return c.json(toPublicChannel(channel));
  });

  app.delete("/:id", async (c) => {
    await prisma.notificationChannel.delete({ where: { id: c.req.param("id") } });
    return c.json({ ok: true });
  });

  app.post("/:id/test", async (c) => {
    const channel = await prisma.notificationChannel.findUnique({
      where: { id: c.req.param("id") },
    });
    if (!channel) return c.json({ error: "未找到渠道" }, 404);
    const adapter = getNotifyAdapter(channel.type);
    if (!adapter) return c.json({ error: "该渠道类型尚未实现" }, 400);
    const result = await adapter.sendTest(channel.config as Record<string, string>);
    return c.json(result, result.ok ? 200 : 502);
  });

  return app;
}
