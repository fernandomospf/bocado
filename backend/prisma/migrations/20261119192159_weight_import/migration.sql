-- CreateEnum
CREATE TYPE "WeightImportSource" AS ENUM ('CSV', 'APPLE_HEALTH');

-- AlterTable
ALTER TABLE "weight_entries" ADD COLUMN     "importId" UUID;

-- CreateTable
CREATE TABLE "weight_imports" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "source" "WeightImportSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "weight_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "weight_imports_userId_createdAt_idx" ON "weight_imports"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "weight_entries_importId_idx" ON "weight_entries"("importId");

-- AddForeignKey
ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_importId_fkey" FOREIGN KEY ("importId") REFERENCES "weight_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_imports" ADD CONSTRAINT "weight_imports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
