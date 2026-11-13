-- Extensões da busca: unaccent (ignora acentos) e pg_trgm (similaridade por trigramas, índice GIN)
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "FoodSource" AS ENUM ('TACO', 'CUSTOM');

-- AlterEnum
ALTER TYPE "MealSource" ADD VALUE 'SEARCH';

-- CreateTable
CREATE TABLE "foods" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "searchName" TEXT NOT NULL,
    "category" TEXT,
    "source" "FoodSource" NOT NULL,
    "kcal100" DOUBLE PRECISION NOT NULL,
    "protein100" DOUBLE PRECISION NOT NULL,
    "carbs100" DOUBLE PRECISION NOT NULL,
    "fat100" DOUBLE PRECISION NOT NULL,
    "portionGrams" DOUBLE PRECISION,
    "portionLabel" TEXT,
    "userId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "foods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "foods_searchName_idx" ON "foods" USING GIN ("searchName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "foods_userId_idx" ON "foods"("userId");

-- CreateIndex
CREATE INDEX "foods_source_name_idx" ON "foods"("source", "name");

-- AddForeignKey
ALTER TABLE "foods" ADD CONSTRAINT "foods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
