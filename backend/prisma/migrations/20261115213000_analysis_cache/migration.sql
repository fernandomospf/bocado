-- CreateTable
CREATE TABLE "analysis_cache" (
    "key" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHitAt" TIMESTAMP(3),

    CONSTRAINT "analysis_cache_pkey" PRIMARY KEY ("key")
);
