-- A guest's ID scan belongs to the stay it was uploaded for: it no longer
-- counts on (or shows on) another stay of the same returning guest.
ALTER TABLE "GuestDocument" ADD COLUMN IF NOT EXISTS "incomeEntryId" TEXT;
CREATE INDEX IF NOT EXISTS "GuestDocument_incomeEntryId_idx" ON "GuestDocument"("incomeEntryId");
-- A deleted booking takes its ID scans with it (a passport copy has no other use).
ALTER TABLE "GuestDocument" DROP CONSTRAINT IF EXISTS "GuestDocument_incomeEntryId_fkey";
ALTER TABLE "GuestDocument" ADD CONSTRAINT "GuestDocument_incomeEntryId_fkey"
  FOREIGN KEY ("incomeEntryId") REFERENCES "IncomeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One post-stay check per booking, enforced by the database (two phones
-- starting it at once). Partial: other report types carry no booking.
-- Not expressible in schema.prisma — listed in KNOWN_DRIFT (scripts/schema-drift.ts).
CREATE UNIQUE INDEX IF NOT EXISTS "ConditionReport_post_stay_booking_key"
  ON "ConditionReport"("incomeEntryId") WHERE "reportType" = 'POST_STAY';
