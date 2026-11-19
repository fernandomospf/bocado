-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "fastingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "fasting_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "targetHours" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fasting_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fasting_sessions_userId_startedAt_idx" ON "fasting_sessions"("userId", "startedAt");

-- AddForeignKey
ALTER TABLE "fasting_sessions" ADD CONSTRAINT "fasting_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Uma sessão ATIVA por pessoa (garantido no banco, mesmo com dois pedidos ao mesmo tempo)
CREATE UNIQUE INDEX "fasting_sessions_one_active_per_user" ON "fasting_sessions"("userId") WHERE "endedAt" IS NULL;

-- Horas da meta: 12 a 20
ALTER TABLE "fasting_sessions" ADD CONSTRAINT "fasting_sessions_target_hours_chk" CHECK ("targetHours" BETWEEN 12 AND 20);
