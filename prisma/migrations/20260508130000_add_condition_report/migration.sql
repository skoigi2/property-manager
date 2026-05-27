-- Move-In Checklist / Unit Condition Report

-- Extend DocumentCategory enum
ALTER TYPE "DocumentCategory" ADD VALUE 'CONDITION_REPORT';

-- New enums
CREATE TYPE "ConditionReportType" AS ENUM ('MOVE_IN', 'MID_TERM', 'MOVE_OUT');
CREATE TYPE "ConditionItemStatus" AS ENUM ('PERFECT', 'GOOD', 'FAIR', 'POOR');

-- ConditionReport
CREATE TABLE "ConditionReport" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "tenantId" TEXT,
    "organizationId" TEXT,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "reportType" "ConditionReportType" NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "overallComments" TEXT,
    "signedByTenant" BOOLEAN NOT NULL DEFAULT false,
    "signedByManager" BOOLEAN NOT NULL DEFAULT false,
    "tenantDocumentId" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConditionReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConditionReport_tenantDocumentId_key" ON "ConditionReport"("tenantDocumentId");
CREATE INDEX "ConditionReport_unitId_idx" ON "ConditionReport"("unitId");
CREATE INDEX "ConditionReport_tenantId_idx" ON "ConditionReport"("tenantId");
CREATE INDEX "ConditionReport_propertyId_reportType_idx" ON "ConditionReport"("propertyId", "reportType");
CREATE INDEX "ConditionReport_reportType_idx" ON "ConditionReport"("reportType");

ALTER TABLE "ConditionReport" ADD CONSTRAINT "ConditionReport_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConditionReport" ADD CONSTRAINT "ConditionReport_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConditionReport" ADD CONSTRAINT "ConditionReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConditionReport" ADD CONSTRAINT "ConditionReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ConditionReportPhoto
CREATE TABLE "ConditionReportPhoto" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConditionReportPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConditionReportPhoto_reportId_idx" ON "ConditionReportPhoto"("reportId");

ALTER TABLE "ConditionReportPhoto" ADD CONSTRAINT "ConditionReportPhoto_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ConditionReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable RLS so the tables cannot be reached via Supabase anon/authenticated keys.
-- Prisma (postgres role) bypasses RLS, so app access still works as normal.
ALTER TABLE "ConditionReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConditionReportPhoto" ENABLE ROW LEVEL SECURITY;
