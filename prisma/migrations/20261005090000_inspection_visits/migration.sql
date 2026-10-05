-- Condition reports become inspection visits that a caretaker (or manager)
-- runs on site: scheduled, assigned, handed in (observations locked) and
-- accepted by a manager. Additive; existing reports are backfilled.

DO $$ BEGIN
  CREATE TYPE "InspectionStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'SUBMITTED', 'ACCEPTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TenantSignOff" AS ENUM ('SIGNED', 'ABSENT', 'REFUSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "status" "InspectionStatus" NOT NULL DEFAULT 'IN_PROGRESS';
ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "scheduledFor" TIMESTAMP(3);
ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "assignedToUserId" TEXT;
ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "tenantIssues" TEXT;
ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "keys" JSONB;
ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "keysClearedAt" TIMESTAMP(3);
ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "keysClearedByUserId" TEXT;
ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "tenantSignOff" "TenantSignOff";
ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "tenantSignedName" TEXT;
ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "tenantSignaturePath" TEXT;
ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "tenantSignedAt" TIMESTAMP(3);
ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "tenantDisagrees" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "tenantComments" TEXT;
ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);
ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "submittedByUserId" TEXT;
ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "submittedByName" TEXT;
ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3);
ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "acceptedByUserId" TEXT;
ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "reviewNote" TEXT;
ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "editRequestedAt" TIMESTAMP(3);
ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "editRequestedByUserId" TEXT;
ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "editRequestReason" TEXT;
ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "sentToTenantAt" TIMESTAMP(3);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConditionReport_assignedToUserId_fkey') THEN
    ALTER TABLE "ConditionReport" ADD CONSTRAINT "ConditionReport_assignedToUserId_fkey"
      FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ConditionReport_propertyId_status_idx" ON "ConditionReport"("propertyId", "status");
CREATE INDEX IF NOT EXISTS "ConditionReport_assignedToUserId_idx" ON "ConditionReport"("assignedToUserId");

-- Reports that already produced their PDF were finished by a manager.
UPDATE "ConditionReport"
SET "status" = 'ACCEPTED',
    "acceptedAt" = COALESCE("pdfGeneratedAt", "updatedAt"),
    "submittedAt" = COALESCE("pdfGeneratedAt", "updatedAt")
WHERE "status" = 'IN_PROGRESS'
  AND ("tenantDocumentId" IS NOT NULL OR "pdfGeneratedAt" IS NOT NULL);
