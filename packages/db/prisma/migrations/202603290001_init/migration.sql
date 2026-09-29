-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('active', 'paused', 'error');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('telegram', 'bark', 'dingtalk', 'feishu', 'wecom', 'email', 'webhook');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'sent', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "MonitorTask" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platforms" TEXT[],
    "keywords" TEXT[],
    "priceMin" DECIMAL(12,2),
    "priceMax" DECIMAL(12,2),
    "brand" TEXT,
    "model" TEXT,
    "category" TEXT,
    "seller" TEXT,
    "intervalSeconds" INTEGER NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'paused',
    "lastCheckedAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitorTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "price" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'JPY',
    "imageUrl" TEXT,
    "seller" TEXT,
    "publishedAt" TIMESTAMP(3),
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" JSONB,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskListing" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "matchedKeyword" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskChannel" (
    "taskId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,

    CONSTRAINT "TaskChannel_pkey" PRIMARY KEY ("taskId","channelId")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "result" TEXT,
    "error" TEXT,
    "itemsFound" INTEGER NOT NULL DEFAULT 0,
    "itemsNew" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonitorTask_status_nextCheckAt_idx" ON "MonitorTask"("status", "nextCheckAt");

-- CreateIndex
CREATE INDEX "Listing_platform_discoveredAt_idx" ON "Listing"("platform", "discoveredAt");

-- CreateIndex
CREATE INDEX "Listing_discoveredAt_idx" ON "Listing"("discoveredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_platform_externalId_key" ON "Listing"("platform", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskListing_taskId_listingId_key" ON "TaskListing"("taskId", "listingId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_listingId_channelId_key" ON "NotificationDelivery"("listingId", "channelId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_updatedAt_idx" ON "NotificationDelivery"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "JobRun_taskId_startedAt_idx" ON "JobRun"("taskId", "startedAt");

-- AddForeignKey
ALTER TABLE "TaskListing" ADD CONSTRAINT "TaskListing_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MonitorTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskListing" ADD CONSTRAINT "TaskListing_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskChannel" ADD CONSTRAINT "TaskChannel_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MonitorTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskChannel" ADD CONSTRAINT "TaskChannel_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "NotificationChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "NotificationChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MonitorTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MonitorTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
