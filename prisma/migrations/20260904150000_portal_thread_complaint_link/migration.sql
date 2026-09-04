-- A portal message thread a manager has logged as a formal complaint.
ALTER TABLE "PortalMessageThread" ADD COLUMN IF NOT EXISTS "complaintId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "PortalMessageThread_complaintId_key" ON "PortalMessageThread"("complaintId");
DO $$ BEGIN
  ALTER TABLE "PortalMessageThread"
    ADD CONSTRAINT "PortalMessageThread_complaintId_fkey"
    FOREIGN KEY ("complaintId") REFERENCES "TenantComplaint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
