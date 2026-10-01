-- Schema drift repair (found 2026-10-01 by `prisma migrate diff` against prod).
-- These schema changes reached dev through `prisma db push` but never got a
-- migration, so production lacked them. Every statement is idempotent.

-- Owner-fee income types: marking a letting / renewal / vacancy / setup /
-- consultancy owner invoice PAID books income of these types.
ALTER TYPE "IncomeType" ADD VALUE IF NOT EXISTS 'LETTING_FEE';
ALTER TYPE "IncomeType" ADD VALUE IF NOT EXISTS 'RENEWAL_FEE';
ALTER TYPE "IncomeType" ADD VALUE IF NOT EXISTS 'VACANCY_FEE';
ALTER TYPE "IncomeType" ADD VALUE IF NOT EXISTS 'SETUP_FEE_INSTALMENT';
ALTER TYPE "IncomeType" ADD VALUE IF NOT EXISTS 'CONSULTANCY_FEE';

-- Property categories offered by the property form.
ALTER TYPE "PropertyCategory" ADD VALUE IF NOT EXISTS 'LAND';
ALTER TYPE "PropertyCategory" ADD VALUE IF NOT EXISTS 'GROUND_LEASE';
ALTER TYPE "PropertyCategory" ADD VALUE IF NOT EXISTS 'COMMERCIAL_SPECIAL_USE';

-- Tenant document category KRA_PIN was renamed TAX_ID ("Tax ID Certificate").
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'DocumentCategory' AND e.enumlabel = 'KRA_PIN'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'DocumentCategory' AND e.enumlabel = 'TAX_ID'
  ) THEN
    ALTER TYPE "DocumentCategory" RENAME VALUE 'KRA_PIN' TO 'TAX_ID';
  END IF;
END $$;

-- Indexes declared in the schema.
CREATE INDEX IF NOT EXISTS "ExpenseEntry_unitId_idx" ON "ExpenseEntry"("unitId");
CREATE INDEX IF NOT EXISTS "ExpenseEntry_isSunkCost_date_idx" ON "ExpenseEntry"("isSunkCost", "date");
CREATE INDEX IF NOT EXISTS "IncomeEntry_type_idx" ON "IncomeEntry"("type");
CREATE INDEX IF NOT EXISTS "IncomeEntry_unitId_type_idx" ON "IncomeEntry"("unitId", "type");
CREATE INDEX IF NOT EXISTS "PettyCash_propertyId_idx" ON "PettyCash"("propertyId");
CREATE INDEX IF NOT EXISTS "Tenant_unitId_idx" ON "Tenant"("unitId");
CREATE INDEX IF NOT EXISTS "Tenant_isActive_idx" ON "Tenant"("isActive");
CREATE INDEX IF NOT EXISTS "Tenant_unitId_isActive_idx" ON "Tenant"("unitId", "isActive");
CREATE INDEX IF NOT EXISTS "Tenant_leaseEnd_idx" ON "Tenant"("leaseEnd");
