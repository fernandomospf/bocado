-- CreateEnum
CREATE TYPE "AdaptiveAction" AS ENUM ('APPLIED', 'DISMISSED', 'SNOOZED');

-- CreateEnum
CREATE TYPE "AdaptiveConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "adaptiveEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "adaptiveSnoozedUntil" DATE;

-- CreateTable
CREATE TABLE "adaptive_adjustments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" "AdaptiveAction" NOT NULL,
    "windowStart" DATE NOT NULL,
    "windowEnd" DATE NOT NULL,
    "avgIntake" DOUBLE PRECISION NOT NULL,
    "weightStartKg" DOUBLE PRECISION NOT NULL,
    "weightEndKg" DOUBLE PRECISION NOT NULL,
    "estimatedTdee" DOUBLE PRECISION NOT NULL,
    "confidence" "AdaptiveConfidence" NOT NULL,
    "previousKcal" INTEGER NOT NULL,
    "newKcal" INTEGER,
    CONSTRAINT "adaptive_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "adaptive_adjustments_userId_createdAt_idx" ON "adaptive_adjustments"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "adaptive_adjustments" ADD CONSTRAINT "adaptive_adjustments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
