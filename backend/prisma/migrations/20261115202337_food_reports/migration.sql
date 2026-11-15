-- CreateTable
CREATE TABLE "food_reports" (
    "id" UUID NOT NULL,
    "foodId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "food_reports_foodId_userId_key" ON "food_reports"("foodId", "userId");

-- AddForeignKey
ALTER TABLE "food_reports" ADD CONSTRAINT "food_reports_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "foods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_reports" ADD CONSTRAINT "food_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
