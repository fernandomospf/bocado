-- CreateEnum
CREATE TYPE "WeekStart" AS ENUM ('MONDAY', 'SUNDAY');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "weekStartsOn" "WeekStart" NOT NULL DEFAULT 'MONDAY';
