-- CreateEnum
CREATE TYPE "WorkoutType" AS ENUM ('STRENGTH', 'RUN', 'BIKE', 'WALK', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkoutIntensity" AS ENUM ('LIGHT', 'MODERATE', 'HARD');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "workoutAddToGoal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "workoutEstimateEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "workouts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "WorkoutType" NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "intensity" "WorkoutIntensity" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workouts_userId_date_idx" ON "workouts"("userId", "date");

-- AddForeignKey
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
