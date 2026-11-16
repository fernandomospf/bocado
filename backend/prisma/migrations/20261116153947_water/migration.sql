-- CreateEnum
CREATE TYPE "WaterGoalMode" AS ENUM ('AUTO', 'MANUAL');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "waterBottleMl" INTEGER,
ADD COLUMN     "waterEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "waterGoalManualMl" INTEGER,
ADD COLUMN     "waterGoalMode" "WaterGoalMode" NOT NULL DEFAULT 'AUTO';

-- CreateTable
CREATE TABLE "water_entries" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "amountMl" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "water_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "water_days" (
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "goalMl" INTEGER NOT NULL,

    CONSTRAINT "water_days_pkey" PRIMARY KEY ("userId","date")
);

-- CreateIndex
CREATE INDEX "water_entries_userId_date_idx" ON "water_entries"("userId", "date");

-- AddForeignKey
ALTER TABLE "water_entries" ADD CONSTRAINT "water_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "water_days" ADD CONSTRAINT "water_days_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
