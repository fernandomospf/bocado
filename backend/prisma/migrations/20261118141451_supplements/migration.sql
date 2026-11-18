-- CreateEnum
CREATE TYPE "SupplementCategory" AS ENUM ('MEDICATION', 'SUPPLEMENT', 'VITAMIN', 'OTHER');

-- CreateEnum
CREATE TYPE "DoseUnit" AS ENUM ('ML', 'MG', 'MCG', 'G', 'UI', 'TABLET', 'CAPSULE', 'SCOOP', 'DROP', 'OTHER');

-- CreateEnum
CREATE TYPE "Administration" AS ENUM ('ORAL', 'INJECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('DAILY', 'WEEKDAYS', 'EVERY_N_DAYS');

-- CreateEnum
CREATE TYPE "Slot" AS ENUM ('ANY', 'MORNING', 'AFTERNOON', 'NIGHT');

-- CreateEnum
CREATE TYPE "InjectionSite" AS ENUM ('ABDOMEN_L', 'ABDOMEN_R', 'THIGH_L', 'THIGH_R', 'GLUTE_L', 'GLUTE_R', 'DELTOID_L', 'DELTOID_R', 'OTHER');

-- CreateEnum
CREATE TYPE "IntakeStatus" AS ENUM ('TAKEN', 'SKIPPED');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "supplementsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "supplementsMaskNamesOnHome" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "supplement_plans" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "SupplementCategory" NOT NULL,
    "administration" "Administration" NOT NULL DEFAULT 'ORAL',
    "doseAmount" DOUBLE PRECISION NOT NULL,
    "doseUnit" "DoseUnit" NOT NULL,
    "doseUnitLabel" TEXT,
    "scheduleType" "ScheduleType" NOT NULL,
    "weekdays" INTEGER[],
    "intervalDays" INTEGER,
    "slots" "Slot"[] DEFAULT ARRAY['ANY']::"Slot"[],
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "notes" TEXT,
    "trackSite" BOOLEAN NOT NULL DEFAULT false,
    "showOnWeightChart" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplement_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_logs" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "slot" "Slot" NOT NULL DEFAULT 'ANY',
    "status" "IntakeStatus" NOT NULL,
    "takenAt" TIMESTAMP(3),
    "doseAmount" DOUBLE PRECISION NOT NULL,
    "doseUnit" "DoseUnit" NOT NULL,
    "doseUnitLabel" TEXT,
    "site" "InjectionSite",
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intake_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplement_plans_userId_archivedAt_idx" ON "supplement_plans"("userId", "archivedAt");

-- CreateIndex
CREATE INDEX "intake_logs_userId_date_idx" ON "intake_logs"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "intake_logs_planId_date_slot_key" ON "intake_logs"("planId", "date", "slot");

-- AddForeignKey
ALTER TABLE "supplement_plans" ADD CONSTRAINT "supplement_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_logs" ADD CONSTRAINT "intake_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_logs" ADD CONSTRAINT "intake_logs_planId_fkey" FOREIGN KEY ("planId") REFERENCES "supplement_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
