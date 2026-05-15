-- CaseThread additions
ALTER TABLE "CaseThread" ADD COLUMN IF NOT EXISTS "currentStageIndex"    INTEGER     NOT NULL DEFAULT 0;
ALTER TABLE "CaseThread" ADD COLUMN IF NOT EXISTS "workflowKey"          TEXT;
ALTER TABLE "CaseThread" ADD COLUMN IF NOT EXISTS "stageSlaHours"        JSONB;
ALTER TABLE "CaseThread" ADD COLUMN IF NOT EXISTS "waitingPausedSeconds" INTEGER     NOT NULL DEFAULT 0;
ALTER TABLE "CaseThread" ADD COLUMN IF NOT EXISTS "lastWaitingPauseAt"   TIMESTAMP(3);

-- Invoice → CaseThread link
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "caseThreadId" TEXT;
CREATE INDEX IF NOT EXISTS "Invoice_caseThreadId_idx" ON "Invoice"("caseThreadId");

DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_caseThreadId_fkey"
    FOREIGN KEY ("caseThreadId") REFERENCES "CaseThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Add SLA_BREACH to HintType enum (idempotent — Postgres won't add if it already exists)
DO $$ BEGIN
  ALTER TYPE "HintType" ADD VALUE 'SLA_BREACH';
EXCEPTION WHEN duplicate_object THEN null; END $$;
