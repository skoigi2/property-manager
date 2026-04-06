-- Migration: add_tax_engine
-- Adds TaxType enum, TaxConfiguration table, and tax snapshot fields
-- on IncomeEntry and ExpenseLineItem. Also adds vatRegistrationNumber
-- to Organization/Property and isTaxExempt to Tenant.

-- 1. New enum
CREATE TYPE "TaxType" AS ENUM ('ADDITIVE', 'WITHHELD');

-- 2. New columns on Organization
ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "vatRegistrationNumber" TEXT;

-- 3. New columns on Property
ALTER TABLE "Property"
  ADD COLUMN IF NOT EXISTS "vatRegistrationNumber" TEXT;

-- 4. New column on Tenant
ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "isTaxExempt" BOOLEAN NOT NULL DEFAULT false;

-- 5. New columns on IncomeEntry
ALTER TABLE "IncomeEntry"
  ADD COLUMN IF NOT EXISTS "taxConfigId" TEXT,
  ADD COLUMN IF NOT EXISTS "taxRate"     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "taxAmount"   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "taxType"     "TaxType";

-- 6. New columns on ExpenseLineItem
ALTER TABLE "ExpenseLineItem"
  ADD COLUMN IF NOT EXISTS "taxConfigId" TEXT,
  ADD COLUMN IF NOT EXISTS "taxRate"     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "taxAmount"   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "taxType"     "TaxType";

-- 7. New TaxConfiguration table
CREATE TABLE "TaxConfiguration" (
    "id"            TEXT        NOT NULL,
    "orgId"         TEXT        NOT NULL,
    "propertyId"    TEXT,
    "label"         TEXT        NOT NULL,
    "rate"          DOUBLE PRECISION NOT NULL,
    "type"          "TaxType"   NOT NULL,
    "appliesTo"     TEXT[]      NOT NULL,
    "isInclusive"   BOOLEAN     NOT NULL DEFAULT false,
    "isActive"      BOOLEAN     NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxConfiguration_pkey" PRIMARY KEY ("id")
);

-- 8. Foreign keys
ALTER TABLE "TaxConfiguration"
  ADD CONSTRAINT "TaxConfiguration_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaxConfiguration"
  ADD CONSTRAINT "TaxConfiguration_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 9. Indexes
CREATE INDEX IF NOT EXISTS "TaxConfiguration_orgId_idx"          ON "TaxConfiguration"("orgId");
CREATE INDEX IF NOT EXISTS "TaxConfiguration_propertyId_idx"     ON "TaxConfiguration"("propertyId");
CREATE INDEX IF NOT EXISTS "TaxConfiguration_orgId_isActive_idx" ON "TaxConfiguration"("orgId", "isActive");
