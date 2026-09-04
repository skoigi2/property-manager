-- Tenant complaints: CaseType COMPLAINT + the TenantComplaint domain record.
-- ALTER TYPE ... ADD VALUE first and never referenced later in this script
-- (Postgres forbids using a new enum label in the same transaction).
ALTER TYPE "CaseType" ADD VALUE IF NOT EXISTS 'COMPLAINT';

DO $$ BEGIN
  CREATE TYPE "ComplaintCategory" AS ENUM ('NOISE','NEIGHBOUR','SECURITY','PREMISES','STAFF_CONDUCT','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ComplaintSource" AS ENUM ('STAFF','PORTAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "TenantComplaint" (
  "id"             TEXT PRIMARY KEY,
  "propertyId"     TEXT NOT NULL REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "unitId"         TEXT REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "tenantId"       TEXT REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "subjectUnitId"  TEXT REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "category"       "ComplaintCategory" NOT NULL DEFAULT 'OTHER',
  "title"          TEXT NOT NULL,
  "description"    TEXT,
  "source"         "ComplaintSource" NOT NULL,
  "raisedByUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "raisedByName"   TEXT NOT NULL,
  "caseThreadId"   TEXT UNIQUE REFERENCES "CaseThread"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedAt"     TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "TenantComplaint_propertyId_createdAt_idx" ON "TenantComplaint"("propertyId", "createdAt");
CREATE INDEX IF NOT EXISTS "TenantComplaint_tenantId_idx" ON "TenantComplaint"("tenantId");
CREATE INDEX IF NOT EXISTS "TenantComplaint_organizationId_idx" ON "TenantComplaint"("organizationId");
