-- Short-stay guests (Phase 3, caretaker check-in / check-out): the on-site
-- record of a booking (guest ID, keys to the guest and the cleaner), post-stay
-- inspections linked to the booking, and who uploaded a guest document.
-- Additive only.

ALTER TYPE "ConditionReportType" ADD VALUE IF NOT EXISTS 'POST_STAY';

ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "incomeEntryId" TEXT;
CREATE INDEX IF NOT EXISTS "ConditionReport_incomeEntryId_idx" ON "ConditionReport"("incomeEntryId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConditionReport_incomeEntryId_fkey') THEN
    ALTER TABLE "ConditionReport" ADD CONSTRAINT "ConditionReport_incomeEntryId_fkey"
      FOREIGN KEY ("incomeEntryId") REFERENCES "IncomeEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "GuestDocument" ADD COLUMN IF NOT EXISTS "uploadedByUserId" TEXT;

CREATE TABLE IF NOT EXISTS "GuestStay" (
  "id" TEXT NOT NULL,
  "incomeEntryId" TEXT NOT NULL,
  "idOverrideReason" TEXT,
  "idOverrideAt" TIMESTAMP(3),
  "idOverrideByName" TEXT,
  "keysHanded" JSONB,
  "keysHandedAt" TIMESTAMP(3),
  "keysHandedByName" TEXT,
  "keysReturnedAt" TIMESTAMP(3),
  "keysReturnedByName" TEXT,
  "cleanerName" TEXT,
  "cleanerKeysOutAt" TIMESTAMP(3),
  "cleanerKeysOutByName" TEXT,
  "cleanerKeysBackAt" TIMESTAMP(3),
  "cleanerKeysBackByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuestStay_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuestStay_incomeEntryId_fkey" FOREIGN KEY ("incomeEntryId") REFERENCES "IncomeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "GuestStay_incomeEntryId_key" ON "GuestStay"("incomeEntryId");
ALTER TABLE "GuestStay" ENABLE ROW LEVEL SECURITY;
