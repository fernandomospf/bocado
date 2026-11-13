-- CreateEnum
CREATE TYPE "FoodStatus" AS ENUM ('ACTIVE', 'REPORTED', 'HIDDEN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FoodSource" ADD VALUE 'OFF';
ALTER TYPE "FoodSource" ADD VALUE 'LABEL';

-- AlterTable
ALTER TABLE "foods" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "brand" TEXT,
ADD COLUMN     "contributedById" UUID,
ADD COLUMN     "reportCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "servingGrams" DOUBLE PRECISION,
ADD COLUMN     "servingLabel" TEXT,
ADD COLUMN     "status" "FoodStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "barcode_misses" (
    "code" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "barcode_misses_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE UNIQUE INDEX "foods_barcode_key" ON "foods"("barcode");

-- AddForeignKey
ALTER TABLE "foods" ADD CONSTRAINT "foods_contributedById_fkey" FOREIGN KEY ("contributedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

