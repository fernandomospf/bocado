-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "a11yHighContrast" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "a11yReduceMotion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "a11yReduceTransparency" BOOLEAN NOT NULL DEFAULT false;
