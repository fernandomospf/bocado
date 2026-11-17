-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "movementEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "movementGoalMin" INTEGER DEFAULT 150,
ALTER COLUMN "workoutEstimateEnabled" SET DEFAULT true;

-- Menores de 18 anos não recebem a meta padrão de movimento (a pessoa define a própria ou vê só os minutos).
-- workoutEstimateEnabled: só o DEFAULT mudou; as linhas existentes ficam como estão.
UPDATE "profiles" SET "movementGoalMin" = NULL WHERE "birthDate" > (CURRENT_DATE - INTERVAL '18 years');
