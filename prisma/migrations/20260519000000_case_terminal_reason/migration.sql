-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "CaseTerminalReason" AS ENUM ('COMPLETED_NORMALLY', 'BYPASSED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AlterTable
ALTER TABLE "CaseThread" ADD COLUMN IF NOT EXISTS "terminalReason"  "CaseTerminalReason";
ALTER TABLE "CaseThread" ADD COLUMN IF NOT EXISTS "bypassedAtStage" TEXT;
