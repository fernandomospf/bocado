-- AlterEnum
ALTER TYPE "FoodStatus" ADD VALUE 'MERGED';

-- AlterTable
ALTER TABLE "foods" ADD COLUMN     "mergedIntoId" UUID,
ADD COLUMN     "verifyCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "food_confirmations" (
    "id" UUID NOT NULL,
    "foodId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "food_confirmations_foodId_userId_key" ON "food_confirmations"("foodId", "userId");

-- CreateIndex
CREATE INDEX "foods_mergedIntoId_idx" ON "foods"("mergedIntoId");

-- AddForeignKey
ALTER TABLE "foods" ADD CONSTRAINT "foods_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "foods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_confirmations" ADD CONSTRAINT "food_confirmations_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "foods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_confirmations" ADD CONSTRAINT "food_confirmations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
