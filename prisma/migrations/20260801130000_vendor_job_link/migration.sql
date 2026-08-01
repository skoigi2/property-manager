-- Vendor magic link: a tokenised page where the assigned vendor submits a
-- quote (and optionally a visit date) without an account. Submitting advances
-- the linked case from "Quote requested" to "Quote received".
ALTER TABLE "MaintenanceJob" ADD COLUMN IF NOT EXISTS "vendorLinkToken" TEXT;
ALTER TABLE "MaintenanceJob" ADD COLUMN IF NOT EXISTS "vendorLinkExpiresAt" TIMESTAMP(3);
ALTER TABLE "MaintenanceJob" ADD COLUMN IF NOT EXISTS "vendorQuoteAmount" DECIMAL(14,2);
ALTER TABLE "MaintenanceJob" ADD COLUMN IF NOT EXISTS "vendorQuoteNote" TEXT;
ALTER TABLE "MaintenanceJob" ADD COLUMN IF NOT EXISTS "vendorQuoteAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "MaintenanceJob_vendorLinkToken_key" ON "MaintenanceJob"("vendorLinkToken");
