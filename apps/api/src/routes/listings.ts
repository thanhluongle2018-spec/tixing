import { Hono } from "hono";
import { prisma, Prisma } from "@tixing/db";
import { ListingQuerySchema } from "@tixing/shared";

export function listingRoutes() {
  const app = new Hono();

  app.get("/", async (c) => {
    const query = ListingQuerySchema.parse(c.req.query());
    const where: Prisma.ListingWhereInput = {};
    if (query.platform) where.platform = query.platform;
    if (query.keyword) {
      where.title = { contains: query.keyword, mode: "insensitive" };
    }
    if (query.priceMin != null || query.priceMax != null) {
      where.price = {};
      if (query.priceMin != null) where.price.gte = query.priceMin;
      if (query.priceMax != null) where.price.lte = query.priceMax;
    }
    if (query.from || query.to) {
      where.discoveredAt = {};
      if (query.from) where.discoveredAt.gte = new Date(query.from);
      if (query.to) where.discoveredAt.lte = new Date(query.to);
    }

    const [total, items] = await Promise.all([
      prisma.listing.count({ where }),
      prisma.listing.findMany({
        where,
        orderBy: { discoveredAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return c.json({ total, page: query.page, pageSize: query.pageSize, items });
  });

  app.get("/:id", async (c) => {
    const item = await prisma.listing.findUnique({
      where: { id: c.req.param("id") },
      include: {
        tasks: { include: { task: true } },
        deliveries: { include: { channel: true } },
      },
    });
    if (!item) return c.json({ error: "未找到商品" }, 404);
    return c.json(item);
  });

  return app;
}
