-- Tenant invoices gain optional move-in lines (deposit, admin fee, lease
-- agreement fee); several invoices per tenant per month are allowed; new
-- IncomeType values for the once-off fees; property-level defaults for the
-- move-in preset.
--
-- NOTE: `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block. When
-- applying by hand (Supabase SQL editor / script), run each statement on its own.

ALTER TYPE "IncomeType" ADD VALUE IF NOT EXISTS 'ADMIN_FEE';
ALTER TYPE "IncomeType" ADD VALUE IF NOT EXISTS 'LEASE_FEE';

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "depositAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "adminFee"      DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "leaseFee"      DECIMAL(14,2) NOT NULL DEFAULT 0;

-- One invoice per tenant per month is no longer a database rule (only one
-- RENT invoice per month, enforced in code). Keep a plain index for lookups.
DROP INDEX IF EXISTS "Invoice_tenantId_periodYear_periodMonth_key";
CREATE INDEX IF NOT EXISTS "Invoice_tenantId_periodYear_periodMonth_idx" ON "Invoice"("tenantId", "periodYear", "periodMonth");

ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "adminFeeDefault" DECIMAL(14,2);
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "leaseFeeDefault" DECIMAL(14,2);
