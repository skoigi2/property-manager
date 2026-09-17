-- Utility metering (water / electricity): meters, tariffs, monthly readings,
-- two metered lines on the tenant invoice, and a utility tag on income rows.
--
-- Everything here is additive. When applying by hand (Supabase SQL editor),
-- the CREATE TYPE statements may be run together with the rest: unlike
-- `ALTER TYPE ... ADD VALUE`, creating a new enum is transaction-safe.

DO $$ BEGIN
  CREATE TYPE "UtilityType" AS ENUM ('WATER', 'ELECTRICITY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MeterRole" AS ENUM ('UNIT', 'COMMON', 'BULK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MeterReadingStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'VOID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Invoice: metered lines (always the sum of the attached readings).
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "waterAmount"       DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "electricityAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- IncomeEntry: which utility a UTILITY_RECOVERY row collected.
ALTER TABLE "IncomeEntry" ADD COLUMN IF NOT EXISTS "utilityType" "UtilityType";

CREATE TABLE IF NOT EXISTS "UtilitySetting" (
  "id"                      TEXT NOT NULL,
  "propertyId"              TEXT NOT NULL,
  "utility"                 "UtilityType" NOT NULL,
  "unitLabel"               TEXT NOT NULL DEFAULT 'units',
  "holdInvoicesForReadings" BOOLEAN NOT NULL DEFAULT true,
  "requirePhoto"            BOOLEAN NOT NULL DEFAULT false,
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UtilitySetting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UtilitySetting_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "UtilitySetting_propertyId_utility_key" ON "UtilitySetting"("propertyId", "utility");

CREATE TABLE IF NOT EXISTS "UtilityTariff" (
  "id"            TEXT NOT NULL,
  "propertyId"    TEXT NOT NULL,
  "utility"       "UtilityType" NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "supplyRate"    DOUBLE PRECISION NOT NULL,
  "fuelRate"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "notes"         TEXT,
  "createdByName" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UtilityTariff_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UtilityTariff_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "UtilityTariff_propertyId_utility_effectiveFrom_idx" ON "UtilityTariff"("propertyId", "utility", "effectiveFrom");

CREATE TABLE IF NOT EXISTS "UtilityMeter" (
  "id"                  TEXT NOT NULL,
  "organizationId"      TEXT,
  "propertyId"          TEXT NOT NULL,
  "unitId"              TEXT,
  "utility"             "UtilityType" NOT NULL,
  "role"                "MeterRole" NOT NULL DEFAULT 'UNIT',
  "label"               TEXT NOT NULL,
  "meterNumber"         TEXT,
  "openingReading"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "openingReadingDate"  TIMESTAMP(3),
  "ratePerUnitOverride" DOUBLE PRECISION,
  "isActive"            BOOLEAN NOT NULL DEFAULT true,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UtilityMeter_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UtilityMeter_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UtilityMeter_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "UtilityMeter_propertyId_utility_idx" ON "UtilityMeter"("propertyId", "utility");
CREATE INDEX IF NOT EXISTS "UtilityMeter_unitId_idx" ON "UtilityMeter"("unitId");

CREATE TABLE IF NOT EXISTS "MeterReading" (
  "id"                     TEXT NOT NULL,
  "meterId"                TEXT NOT NULL,
  "periodYear"             INTEGER NOT NULL,
  "periodMonth"            INTEGER NOT NULL,
  "readingDate"            TIMESTAMP(3) NOT NULL,
  "previousReading"        DOUBLE PRECISION NOT NULL,
  "currentReading"         DOUBLE PRECISION NOT NULL,
  "consumption"            DOUBLE PRECISION NOT NULL,
  "supplyRate"             DOUBLE PRECISION,
  "fuelRate"               DOUBLE PRECISION,
  "ratePerUnit"            DOUBLE PRECISION,
  "amount"                 DECIMAL(14,2),
  "status"                 "MeterReadingStatus" NOT NULL DEFAULT 'SUBMITTED',
  "tenantId"               TEXT,
  "invoiceId"              TEXT,
  "readByUserId"           TEXT,
  "readByName"             TEXT,
  "approvedByUserId"       TEXT,
  "approvedByName"         TEXT,
  "approvedAt"             TIMESTAMP(3),
  "photoPaths"             TEXT[],
  "notes"                  TEXT,
  "previousOverrideReason" TEXT,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MeterReading_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MeterReading_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "UtilityMeter"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MeterReading_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MeterReading_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "MeterReading_meterId_periodYear_periodMonth_idx" ON "MeterReading"("meterId", "periodYear", "periodMonth");
CREATE INDEX IF NOT EXISTS "MeterReading_tenantId_status_invoiceId_idx" ON "MeterReading"("tenantId", "status", "invoiceId");
CREATE INDEX IF NOT EXISTS "MeterReading_invoiceId_idx" ON "MeterReading"("invoiceId");
