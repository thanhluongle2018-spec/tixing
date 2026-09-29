import { PrismaClient } from "@prisma/client";

export { Prisma, PrismaClient } from "@prisma/client";
export type {
  MonitorTask,
  Listing,
  NotificationChannel,
  NotificationDelivery,
  JobRun,
  TaskStatus,
  ChannelType,
  DeliveryStatus,
} from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function createPrismaClient(url?: string): PrismaClient {
  return new PrismaClient({
    datasources: url ? { db: { url } } : undefined,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
