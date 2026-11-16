-- AlterTable
ALTER TABLE "meals" ADD COLUMN     "share" DOUBLE PRECISION,
ADD COLUMN     "sharedById" UUID,
ADD COLUMN     "sharedGroupId" UUID;

-- CreateTable
CREATE TABLE "shared_meal_offers" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "fromUserId" UUID NOT NULL,
    "toUserId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "MealType" NOT NULL,
    "source" "MealSource" NOT NULL,
    "share" DOUBLE PRECISION NOT NULL,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shared_meal_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shared_meal_offers_toUserId_idx" ON "shared_meal_offers"("toUserId");

-- CreateIndex
CREATE INDEX "shared_meal_offers_groupId_idx" ON "shared_meal_offers"("groupId");

-- CreateIndex
CREATE INDEX "meals_sharedGroupId_idx" ON "meals"("sharedGroupId");

-- AddForeignKey
ALTER TABLE "meals" ADD CONSTRAINT "meals_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_meal_offers" ADD CONSTRAINT "shared_meal_offers_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_meal_offers" ADD CONSTRAINT "shared_meal_offers_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
