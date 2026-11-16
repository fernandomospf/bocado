-- Registro por chamada à IA (tokens e custo), cotas diárias e mensais por funcionalidade e fator de limite por usuário.
-- O contador diário antigo (ai_usage: userId + dia + recurso + contagem) é substituído: o que já foi usado HOJE vira
-- linhas OK do novo registro, para a regra de sugestões por dia não zerar na virada da migration.

-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('PHOTO', 'TEXT', 'LABEL', 'SUGGEST');

-- CreateEnum
CREATE TYPE "AiUsageStatus" AS ENUM ('PENDING', 'OK', 'FAILED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "aiLimitFactor" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- A tabela antiga sai do caminho (mantida até a cópia)
ALTER TABLE "ai_usage" RENAME TO "ai_usage_old";
ALTER TABLE "ai_usage_old" DROP CONSTRAINT "ai_usage_pkey";
ALTER TABLE "ai_usage_old" DROP CONSTRAINT "ai_usage_userId_fkey";

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "feature" "AiFeature" NOT NULL,
    "model" TEXT NOT NULL,
    "status" "AiUsageStatus" NOT NULL DEFAULT 'PENDING',
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- Migra o uso de hoje (dia UTC do contador antigo) das sugestões com IA, uma linha por chamada já feita
INSERT INTO "ai_usage" ("id", "userId", "feature", "model", "status", "createdAt", "settledAt")
SELECT gen_random_uuid(), o."userId", 'SUGGEST'::"AiFeature", 'migrado', 'OK'::"AiUsageStatus", now(), now()
  FROM "ai_usage_old" o, generate_series(1, LEAST(o."count", 50)) AS g
 WHERE o."feature" = 'close-day-ai' AND o."day" = (now() AT TIME ZONE 'UTC')::date;

DROP TABLE "ai_usage_old";

-- CreateIndex
CREATE INDEX "ai_usage_userId_createdAt_idx" ON "ai_usage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_createdAt_idx" ON "ai_usage"("createdAt");

-- AddForeignKey (ao excluir a conta, o registro fica anônimo)
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
