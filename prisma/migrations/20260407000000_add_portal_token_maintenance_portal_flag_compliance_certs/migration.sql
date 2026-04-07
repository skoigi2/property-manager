-- Migration: add_portal_token_maintenance_portal_flag_compliance_certs
-- Adds tenant portal token, submittedViaPortal flag on MaintenanceJob,
-- and the ComplianceCertificate table.

-- 1. Tenant portal token fields
ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "portalToken" TEXT,
  ADD COLUMN IF NOT EXISTS "portalTokenExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_portalToken_key" ON "Tenant"("portalToken");
CREATE INDEX IF NOT EXISTS "Tenant_portalToken_idx" ON "Tenant"("portalToken");

-- 2. MaintenanceJob portal submission flag
ALTER TABLE "MaintenanceJob"
  ADD COLUMN IF NOT EXISTS "submittedViaPortal" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "MaintenanceJob_submittedViaPortal_idx" ON "MaintenanceJob"("submittedViaPortal");

-- 3. ComplianceCertificate table
CREATE TABLE IF NOT EXISTS "ComplianceCertificate" (
  "id"                  TEXT NOT NULL,
  "organizationId"      TEXT,
  "propertyId"          TEXT NOT NULL,
  "certificateType"     TEXT NOT NULL,
  "certificateNumber"   TEXT,
  "issuedBy"            TEXT,
  "issueDate"           TIMESTAMP(3) NOT NULL,
  "expiryDate"          TIMESTAMP(3),
  "notes"               TEXT,
  "documentStoragePath" TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ComplianceCertificate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ComplianceCertificate"
  ADD CONSTRAINT "ComplianceCertificate_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ComplianceCertificate"
  ADD CONSTRAINT "ComplianceCertificate_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "ComplianceCertificate_propertyId_idx" ON "ComplianceCertificate"("propertyId");
CREATE INDEX IF NOT EXISTS "ComplianceCertificate_organizationId_idx" ON "ComplianceCertificate"("organizationId");
CREATE INDEX IF NOT EXISTS "ComplianceCertificate_expiryDate_idx" ON "ComplianceCertificate"("expiryDate");
