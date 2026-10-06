-- Quote requests (Phase 4 of caretaker check-in / check-out): several vendors
-- quote one maintenance job, each through its own link; a manager accepts one.
-- Additive only. The job's single vendor link (vendorLinkToken / vendorQuote*)
-- stays for older jobs.

DO $$ BEGIN
  CREATE TYPE "MaintenanceQuoteStatus" AS ENUM ('REQUESTED', 'RECEIVED', 'ACCEPTED', 'DECLINED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "MaintenanceQuote" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "status" "MaintenanceQuoteStatus" NOT NULL DEFAULT 'REQUESTED',
  "linkToken" TEXT,
  "linkExpiresAt" TIMESTAMP(3),
  "amount" DECIMAL(14,2),
  "note" TEXT,
  "availableDate" TIMESTAMP(3),
  "documentPath" TEXT,
  "documentName" TEXT,
  "documentMime" TEXT,
  "requestedByUserId" TEXT,
  "requestedByName" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "receivedAt" TIMESTAMP(3),
  "receivedVia" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decidedByName" TEXT,
  "declineReason" TEXT,
  "autoDeclined" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MaintenanceQuote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceQuote_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "MaintenanceJob"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceQuote_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "MaintenanceQuote_linkToken_key" ON "MaintenanceQuote"("linkToken");
CREATE UNIQUE INDEX IF NOT EXISTS "MaintenanceQuote_jobId_vendorId_key" ON "MaintenanceQuote"("jobId", "vendorId");
CREATE INDEX IF NOT EXISTS "MaintenanceQuote_vendorId_idx" ON "MaintenanceQuote"("vendorId");
ALTER TABLE "MaintenanceQuote" ENABLE ROW LEVEL SECURITY;
