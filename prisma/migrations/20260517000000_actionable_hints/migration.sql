-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "HintType" AS ENUM (
    'INVOICE_OVERDUE','LEASE_EXPIRY_30D','LEASE_EXPIRY_7D','URGENT_OPEN_4H',
    'VACANT_OVER_30D','RENT_INCREASE_DUE','INSPECTION_OVERDUE','DEPOSIT_NOT_SETTLED',
    'RECURRING_EXPENSE_DUE','LOW_PETTY_CASH','NEGATIVE_CASHFLOW_FORECAST',
    'COMPLIANCE_EXPIRY_30D','COMPLIANCE_EXPIRY_7D','INSURANCE_EXPIRY_30D','INSURANCE_EXPIRY_7D'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "HintSeverity" AS ENUM ('URGENT','WARNING','INFO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "HintStatus" AS ENUM ('ACTIVE','ACTED_ON','DISMISSED','EXPIRED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ActionableHint" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "propertyId" TEXT,
  "unitId" TEXT,
  "tenantId" TEXT,
  "caseThreadId" TEXT,
  "hintType" "HintType" NOT NULL,
  "refId" TEXT NOT NULL,
  "severity" "HintSeverity" NOT NULL,
  "title" TEXT NOT NULL,
  "subtitle" TEXT NOT NULL,
  "suggestedAction" TEXT,
  "actionEndpoint" TEXT,
  "actionMethod" TEXT,
  "actionBody" JSONB,
  "actionLabel" TEXT,
  "status" "HintStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3),
  "dismissedByUserId" TEXT,
  "dismissedAt" TIMESTAMP(3),
  "actedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ActionableHint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HintSnooze" (
  "id" TEXT NOT NULL,
  "hintId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "until" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HintSnooze_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "ActionableHint_hintType_refId_key" ON "ActionableHint"("hintType","refId");
CREATE INDEX IF NOT EXISTS "ActionableHint_organizationId_status_severity_idx" ON "ActionableHint"("organizationId","status","severity");
CREATE INDEX IF NOT EXISTS "ActionableHint_propertyId_status_idx" ON "ActionableHint"("propertyId","status");
CREATE INDEX IF NOT EXISTS "ActionableHint_status_expiresAt_idx" ON "ActionableHint"("status","expiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "HintSnooze_hintId_userId_key" ON "HintSnooze"("hintId","userId");
CREATE INDEX IF NOT EXISTS "HintSnooze_userId_until_idx" ON "HintSnooze"("userId","until");

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "ActionableHint" ADD CONSTRAINT "ActionableHint_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ActionableHint" ADD CONSTRAINT "ActionableHint_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ActionableHint" ADD CONSTRAINT "ActionableHint_caseThreadId_fkey"
    FOREIGN KEY ("caseThreadId") REFERENCES "CaseThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "HintSnooze" ADD CONSTRAINT "HintSnooze_hintId_fkey"
    FOREIGN KEY ("hintId") REFERENCES "ActionableHint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Enable RLS
ALTER TABLE "ActionableHint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HintSnooze" ENABLE ROW LEVEL SECURITY;
