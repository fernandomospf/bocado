-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "targetsWeightKg" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "weight_entries" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weight_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weight_entries_userId_date_key" ON "weight_entries"("userId", "date");

-- AddForeignKey
ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migração de dados: o peso atual de cada perfil vira o primeiro registro, na data da última atualização do perfil
INSERT INTO "weight_entries" ("id", "userId", "date", "weightKg", "createdAt")
SELECT gen_random_uuid(), p."userId", p."updatedAt"::date, p."weightKg", CURRENT_TIMESTAMP
  FROM "profiles" p
ON CONFLICT ("userId", "date") DO NOTHING;

-- As metas atuais foram calculadas com o peso atual
UPDATE "profiles" SET "targetsWeightKg" = "weightKg" WHERE "targetsWeightKg" IS NULL;
