-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "movementDailyGoalMin" INTEGER DEFAULT 30,
ADD COLUMN     "movementRestDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- Meta de movimento passa a ser DIÁRIA (padrão 30 min) com dias de descanso. A coluna "movementGoalMin" (semanal)
-- fica no banco, sem uso. Menores de 18 anos: sem meta diária (só os minutos) até a pessoa definir a sua.
UPDATE "profiles" SET "movementDailyGoalMin" = NULL WHERE "birthDate" > (CURRENT_DATE - INTERVAL '18 years');
