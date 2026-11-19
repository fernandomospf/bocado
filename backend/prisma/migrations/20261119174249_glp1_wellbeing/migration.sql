-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "glp1Mode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "proteinFloorG" INTEGER;

-- CreateTable
CREATE TABLE "wellbeing_logs" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "nausea" INTEGER,
    "appetite" INTEGER,
    "energy" INTEGER,
    "gi" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wellbeing_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wellbeing_logs_userId_date_key" ON "wellbeing_logs"("userId", "date");

-- AddForeignKey
ALTER TABLE "wellbeing_logs" ADD CONSTRAINT "wellbeing_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
