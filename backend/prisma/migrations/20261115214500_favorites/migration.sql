-- CreateTable
CREATE TABLE "favorite_meals" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "MealType",
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "favorite_meals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "favorite_meals_userId_idx" ON "favorite_meals"("userId");

-- AddForeignKey
ALTER TABLE "favorite_meals" ADD CONSTRAINT "favorite_meals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
