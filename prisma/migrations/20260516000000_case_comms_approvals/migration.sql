-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DISPUTED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AlterTable
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "caseThreadId" TEXT;
ALTER TABLE "CommunicationLog" ADD COLUMN IF NOT EXISTS "caseThreadId" TEXT;

CREATE INDEX IF NOT EXISTS "EmailLog_caseThreadId_idx" ON "EmailLog"("caseThreadId");
CREATE INDEX IF NOT EXISTS "CommunicationLog_caseThreadId_idx" ON "CommunicationLog"("caseThreadId");

DO $$ BEGIN
  ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_caseThreadId_fkey"
    FOREIGN KEY ("caseThreadId") REFERENCES "CaseThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_caseThreadId_fkey"
    FOREIGN KEY ("caseThreadId") REFERENCES "CaseThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ApprovalRequest" (
  "id" TEXT NOT NULL,
  "caseThreadId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "requestedFromEmail" TEXT NOT NULL,
  "requestedFromName" TEXT,
  "question" TEXT NOT NULL,
  "amount" DOUBLE PRECISION,
  "currency" TEXT,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "respondedAt" TIMESTAMP(3),
  "respondedByName" TEXT,
  "respondedFromIp" TEXT,
  "disputedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ApprovalRequest_token_key" ON "ApprovalRequest"("token");
CREATE INDEX IF NOT EXISTS "ApprovalRequest_caseThreadId_idx" ON "ApprovalRequest"("caseThreadId");
CREATE INDEX IF NOT EXISTS "ApprovalRequest_token_idx" ON "ApprovalRequest"("token");
CREATE INDEX IF NOT EXISTS "ApprovalRequest_status_expiresAt_idx" ON "ApprovalRequest"("status", "expiresAt");

DO $$ BEGIN
  ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_caseThreadId_fkey"
    FOREIGN KEY ("caseThreadId") REFERENCES "CaseThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requestedByUserId_fkey"
    FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Enable RLS
ALTER TABLE "ApprovalRequest" ENABLE ROW LEVEL SECURITY;
