-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('PENDING', 'INVITED', 'JOINED');

-- CreateTable
CREATE TABLE "beta_invites" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,

    CONSTRAINT "beta_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beta_invite_uses" (
    "id" UUID NOT NULL,
    "inviteId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beta_invite_uses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'PENDING',
    "inviteId" UUID,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invitedAt" TIMESTAMP(3),

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "beta_invites_code_key" ON "beta_invites"("code");

-- CreateIndex
CREATE UNIQUE INDEX "beta_invite_uses_userId_key" ON "beta_invite_uses"("userId");

-- CreateIndex
CREATE INDEX "beta_invite_uses_inviteId_idx" ON "beta_invite_uses"("inviteId");

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_email_key" ON "waitlist_entries"("email");

-- CreateIndex
CREATE INDEX "waitlist_entries_status_createdAt_idx" ON "waitlist_entries"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "beta_invites" ADD CONSTRAINT "beta_invites_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beta_invite_uses" ADD CONSTRAINT "beta_invite_uses_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "beta_invites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beta_invite_uses" ADD CONSTRAINT "beta_invite_uses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "beta_invites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
