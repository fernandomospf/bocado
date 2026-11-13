-- CreateTable
CREATE TABLE "suggestion_cache" (
    "key" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHitAt" TIMESTAMP(3),

    CONSTRAINT "suggestion_cache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "userId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "feature" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("userId","day","feature")
);

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
