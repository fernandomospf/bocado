-- AlterTable
ALTER TABLE "meal_items" ADD COLUMN     "recipeId" UUID;

-- CreateIndex
CREATE INDEX "meal_items_recipeId_idx" ON "meal_items"("recipeId");

-- AddForeignKey
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
