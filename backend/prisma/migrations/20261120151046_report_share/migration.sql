-- CreateEnum
CREATE TYPE "ReportShareRevoked" AS ENUM ('USER', 'BLOCKS');

-- CreateTable
CREATE TABLE "report_shares" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "from" DATE NOT NULL,
    "to" DATE NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxDevices" INTEGER NOT NULL DEFAULT 1,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" "ReportShareRevoked",
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "blockNoticedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_share_devices" (
    "id" UUID NOT NULL,
    "linkId" UUID NOT NULL,
    "deviceTokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "report_share_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_share_ip_locks" (
    "ipHash" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_share_ip_locks_pkey" PRIMARY KEY ("ipHash")
);

-- CreateIndex
CREATE UNIQUE INDEX "report_shares_token_key" ON "report_shares"("token");

-- CreateIndex
CREATE INDEX "report_shares_userId_createdAt_idx" ON "report_shares"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "report_share_devices_linkId_idx" ON "report_share_devices"("linkId");

-- CreateIndex
CREATE UNIQUE INDEX "report_share_devices_linkId_deviceTokenHash_key" ON "report_share_devices"("linkId", "deviceTokenHash");

-- AddForeignKey
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_share_devices" ADD CONSTRAINT "report_share_devices_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "report_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;
