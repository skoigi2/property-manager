-- Split single kraPin into tenantKraPin (for tenant invoices) and mgmtKraPin (for owner invoices)
ALTER TABLE "ManagementAgreement"
  ADD COLUMN IF NOT EXISTS "tenantKraPin" TEXT,
  ADD COLUMN IF NOT EXISTS "mgmtKraPin"   TEXT;

-- Migrate existing kraPin value into both fields
UPDATE "ManagementAgreement" SET "tenantKraPin" = "kraPin", "mgmtKraPin" = "kraPin" WHERE "kraPin" IS NOT NULL;

-- Drop the old column
ALTER TABLE "ManagementAgreement" DROP COLUMN IF EXISTS "kraPin";
