import { Hono } from "hono";
import { prisma } from "@tixing/db";
import { listPlatformStatuses } from "@tixing/core";
import { capabilityLabelZh, PLATFORMS } from "@tixing/shared";

export function statsRoutes() {
  const app = new Hono();

  app.get("/", async (c) => {
    const [taskCount, activeTasks, listingCount, deliveries] = await Promise.all([
      prisma.monitorTask.count(),
      prisma.monitorTask.count({ where: { status: "active" } }),
      prisma.listing.count(),
      prisma.notificationDelivery.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    ]);

    const sent = deliveries.find((d) => d.status === "sent")?._count._all ?? 0;
    const failed = deliveries.find((d) => d.status === "failed")?._count._all ?? 0;
    const totalAttempts = sent + failed;
    const successRate = totalAttempts === 0 ? null : sent / totalAttempts;

    const platforms = listPlatformStatuses().map((p) => ({
      id: p.id,
      nameZh: p.nameZh,
      nameJa: p.nameJa,
      capability: p.capability,
      capabilityLabel: capabilityLabelZh(p.capability),
      selectableInMvp: PLATFORMS[p.id].selectableInMvp,
      notesZh: p.notesZh,
    }));

    return c.json({
      tasks: { total: taskCount, active: activeTasks },
      listings: { total: listingCount },
      notifications: { sent, failed, successRate },
      platforms,
    });
  });

  app.get("/platforms", async (c) => {
    return c.json({
      items: listPlatformStatuses().map((p) => ({
        ...p,
        capabilityLabel: capabilityLabelZh(p.capability),
      })),
    });
  });

  return app;
}
