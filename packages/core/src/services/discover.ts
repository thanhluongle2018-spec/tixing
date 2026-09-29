import { Prisma, type PrismaClient } from "@tixing/db";
import {
  PLATFORMS,
  platformLabel,
  type NormalizedListing,
  type PlatformId,
  type SearchQuery,
} from "@tixing/shared";
import { PlatformNotAvailableError } from "../platforms/base.js";
import { getPlatformAdapter } from "../platforms/registry.js";
import { getNotifyAdapter } from "../notifications/registry.js";
import type { NotifyPayload } from "../notifications/base.js";
import { filterNewListings, listingDedupeKey } from "./dedup.js";
import { ConcurrencyGate, RateLimiter } from "./rateLimit.js";

export type DiscoverDeps = {
  prisma: PrismaClient;
  globalGate?: ConcurrencyGate;
  platformLimiter?: RateLimiter;
  notifyMaxAttempts?: number;
  now?: () => Date;
  /** Manual runs may execute even when task is paused. */
  force?: boolean;
};

function toSearchQuery(task: {
  keywords: string[];
  priceMin: { toNumber(): number } | number | null;
  priceMax: { toNumber(): number } | number | null;
  brand: string | null;
  model: string | null;
  category: string | null;
  seller: string | null;
}): SearchQuery {
  const num = (v: { toNumber(): number } | number | null) =>
    v == null ? null : typeof v === "number" ? v : v.toNumber();
  return {
    keywords: task.keywords,
    priceMin: num(task.priceMin),
    priceMax: num(task.priceMax),
    brand: task.brand,
    model: task.model,
    category: task.category,
    seller: task.seller,
  };
}

function matchKeyword(title: string | null, keywords: string[]): string | null {
  if (!title) return keywords[0] ?? null;
  const lower = title.toLowerCase();
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) return kw;
  }
  return keywords[0] ?? null;
}

export async function runTaskCheck(taskId: string, deps: DiscoverDeps) {
  const prisma = deps.prisma;
  const gate = deps.globalGate ?? new ConcurrencyGate(2);
  const limiter = deps.platformLimiter ?? new RateLimiter(5, 1);
  const notifyMaxAttempts = deps.notifyMaxAttempts ?? 3;
  const now = deps.now?.() ?? new Date();

  return gate.run(async () => {
    const task = await prisma.monitorTask.findUnique({
      where: { id: taskId },
      include: {
        channels: { include: { channel: true } },
      },
    });
    if (!task) throw new Error(`任务不存在: ${taskId}`);
    if (task.status === "paused" && !deps.force) {
      return { skipped: true as const };
    }

    const job = await prisma.jobRun.create({
      data: { taskId: task.id, startedAt: now },
    });

    // Reserve the next slot early so the scheduler does not pile up jobs
    // while this check (including notification retries) is still running.
    if (!(task.status === "paused" && deps.force)) {
      await prisma.monitorTask.update({
        where: { id: task.id },
        data: { nextCheckAt: new Date(now.getTime() + task.intervalSeconds * 1000) },
      });
    }

    let itemsFound = 0;
    let itemsNew = 0;
    const errors: string[] = [];
    const brandNew: Array<{ listingId: string; listing: NormalizedListing }> = [];

    try {
      for (const platform of task.platforms as PlatformId[]) {
        if (!PLATFORMS[platform]) {
          errors.push(`未知平台: ${platform}`);
          continue;
        }
        if (!limiter.tryTake(`platform:${platform}`)) {
          errors.push(`${platformLabel(platform)} 触发平台限流，本轮跳过`);
          continue;
        }

        const adapter = getPlatformAdapter(platform);
        if (adapter.capability !== "supported") {
          errors.push(
            `${platformLabel(platform)}：${
              adapter.capability === "needs_auth" ? "需要授权" : "暂不支持"
            }，已跳过采集`,
          );
          continue;
        }

        try {
          const found = await adapter.search(toSearchQuery(task));
          itemsFound += found.length;
          if (found.length === 0) continue;

          const existing = await prisma.listing.findMany({
            where: {
              OR: found.map((f) => ({ platform: f.platform, externalId: f.externalId })),
            },
            select: { id: true, platform: true, externalId: true },
          });
          const existingByKey = new Map(
            existing.map((e) => [
              listingDedupeKey({
                platform: e.platform as PlatformId,
                externalId: e.externalId,
              }),
              e.id,
            ]),
          );
          const fresh = filterNewListings(found, new Set(existingByKey.keys()));
          void fresh;

          for (const item of found) {
            const key = listingDedupeKey(item);
            let listingId = existingByKey.get(key);
            if (!listingId) {
              const created = await prisma.listing.create({
                data: {
                  platform: item.platform,
                  externalId: item.externalId,
                  url: item.url,
                  title: item.title,
                  price: item.price,
                  currency: item.currency,
                  imageUrl: item.imageUrl,
                  seller: item.seller,
                  publishedAt: item.publishedAt,
                  discoveredAt: now,
                  raw: (item.raw as Prisma.InputJsonValue | undefined) ?? undefined,
                },
              });
              listingId = created.id;
              existingByKey.set(key, listingId);
              itemsNew += 1;
              brandNew.push({ listingId, listing: item });
            }

            await prisma.taskListing.upsert({
              where: { taskId_listingId: { taskId: task.id, listingId } },
              create: {
                taskId: task.id,
                listingId,
                matchedKeyword: matchKeyword(item.title, task.keywords),
              },
              update: {},
            });
          }
        } catch (err) {
          if (err instanceof PlatformNotAvailableError) {
            errors.push(err.message);
          } else {
            errors.push(
              `${platformLabel(platform)} 检查失败: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }
      }

      for (const { listingId, listing } of brandNew) {
        for (const { channel } of task.channels) {
          if (!channel.enabled) continue;
          const adapter = getNotifyAdapter(channel.type);
          if (!adapter) continue;

          const existingDelivery = await prisma.notificationDelivery.findUnique({
            where: { listingId_channelId: { listingId, channelId: channel.id } },
          });
          if (existingDelivery?.status === "sent") continue;

          const delivery =
            existingDelivery ??
            (await prisma.notificationDelivery.create({
              data: {
                listingId,
                channelId: channel.id,
                taskId: task.id,
                status: "pending",
              },
            }));

          const price =
            listing.price == null
              ? null
              : typeof listing.price === "number"
                ? listing.price
                : Number(listing.price);

          await attemptDelivery({
            prisma,
            deliveryId: delivery.id,
            startAttempts: delivery.attempts,
            notifyMaxAttempts,
            adapter,
            config: channel.config as Record<string, string>,
            payload: {
              platformLabel: platformLabel(listing.platform),
              title: listing.title,
              price,
              currency: listing.currency,
              imageUrl: listing.imageUrl,
              seller: listing.seller,
              url: listing.url,
            },
          });
        }
      }

      // Resume deliveries left pending/failed after crashes or transient errors.
      const openDeliveries = await prisma.notificationDelivery.findMany({
        where: {
          taskId: task.id,
          status: { in: ["pending", "failed"] },
          attempts: { lt: notifyMaxAttempts },
        },
        include: { listing: true, channel: true },
        take: 50,
      });
      for (const delivery of openDeliveries) {
        if (!delivery.channel.enabled) continue;
        const adapter = getNotifyAdapter(delivery.channel.type);
        if (!adapter) continue;
        const listing = delivery.listing;
        const price =
          listing.price == null
            ? null
            : typeof listing.price === "number"
              ? listing.price
              : Number(listing.price);
        await attemptDelivery({
          prisma,
          deliveryId: delivery.id,
          startAttempts: delivery.attempts,
          notifyMaxAttempts,
          adapter,
          config: delivery.channel.config as Record<string, string>,
          payload: {
            platformLabel: platformLabel(listing.platform as PlatformId),
            title: listing.title,
            price,
            currency: listing.currency,
            imageUrl: listing.imageUrl,
            seller: listing.seller,
            url: listing.url,
          },
        });
      }

      const nextCheckAt = new Date(now.getTime() + task.intervalSeconds * 1000);
      const onlyUnsupported = (task.platforms as PlatformId[]).every(
        (p) => getPlatformAdapter(p).capability !== "supported",
      );

      let nextStatus = task.status;
      if (task.status === "paused" && deps.force) {
        nextStatus = "paused";
      } else if (onlyUnsupported) {
        nextStatus = "error";
      } else {
        nextStatus = "active";
      }

      await prisma.monitorTask.update({
        where: { id: task.id },
        data: {
          lastCheckedAt: now,
          nextCheckAt: task.status === "paused" && deps.force ? task.nextCheckAt : nextCheckAt,
          lastError: errors.length ? errors.join(" | ").slice(0, 2000) : null,
          status: nextStatus,
        },
      });

      await prisma.jobRun.update({
        where: { id: job.id },
        data: {
          finishedAt: new Date(),
          result: "ok",
          error: errors.length ? errors.join(" | ").slice(0, 2000) : null,
          itemsFound,
          itemsNew,
        },
      });

      return { skipped: false as const, itemsFound, itemsNew, errors };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.jobRun.update({
        where: { id: job.id },
        data: { finishedAt: new Date(), result: "error", error: message },
      });
      await prisma.monitorTask.update({
        where: { id: task.id },
        data: {
          lastCheckedAt: now,
          nextCheckAt: new Date(now.getTime() + task.intervalSeconds * 1000),
          lastError: message.slice(0, 2000),
          status: "error",
        },
      });
      throw err;
    }
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function attemptDelivery(args: {
  prisma: PrismaClient;
  deliveryId: string;
  startAttempts: number;
  notifyMaxAttempts: number;
  adapter: NonNullable<ReturnType<typeof getNotifyAdapter>>;
  config: Record<string, string>;
  payload: NotifyPayload;
}) {
  let lastError: string | undefined;
  let ok = false;
  let attempts = args.startAttempts;
  while (attempts < args.notifyMaxAttempts && !ok) {
    attempts += 1;
    // Persist attempt count before network I/O so crashes do not leave attempts=0 forever.
    await args.prisma.notificationDelivery.update({
      where: { id: args.deliveryId },
      data: { attempts, status: "pending", lastError: null },
    });
    const result = await args.adapter.send(args.config, args.payload);
    ok = result.ok;
    lastError = result.error;
    if (!ok) {
      await sleep(Math.min(500 * 2 ** (attempts - 1), 2_000));
    }
  }

  await args.prisma.notificationDelivery.update({
    where: { id: args.deliveryId },
    data: {
      attempts,
      status: ok ? "sent" : "failed",
      lastError: ok ? null : (lastError ?? "未知错误"),
      sentAt: ok ? new Date() : null,
    },
  });
}
