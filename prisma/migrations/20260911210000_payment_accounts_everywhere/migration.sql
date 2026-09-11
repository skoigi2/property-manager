-- Bank details are typed only on Payment Accounts.
-- 1. The property-level landlord / bank columns were read by nothing but the
--    property form (never printed anywhere) — dropped.
-- 2. The manager's billing details on the agreement become a payment-account
--    reference; the inline mgmt* columns stay as the legacy fallback.
ALTER TABLE "Property" DROP COLUMN IF EXISTS "landlordEntity";
ALTER TABLE "Property" DROP COLUMN IF EXISTS "bankName";
ALTER TABLE "Property" DROP COLUMN IF EXISTS "bankAccountName";
ALTER TABLE "Property" DROP COLUMN IF EXISTS "bankAccountNumber";

ALTER TABLE "ManagementAgreement" ADD COLUMN IF NOT EXISTS "mgmtPaymentAccountId" TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManagementAgreement_mgmtPaymentAccountId_fkey') THEN
    ALTER TABLE "ManagementAgreement"
      ADD CONSTRAINT "ManagementAgreement_mgmtPaymentAccountId_fkey"
      FOREIGN KEY ("mgmtPaymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
