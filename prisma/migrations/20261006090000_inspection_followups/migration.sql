-- Inspection follow-ups (Phase 1, caretaker check-in / check-out):
-- emergency contact on the tenant, meter readings on the inspection, the
-- checkout's source inspection, repair jobs raised from inspection damage,
-- and the "ready to re-let" checklist per unit. Additive only.

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "emergencyContactName" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "emergencyContactPhone" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "emergencyContactRelation" TEXT;

ALTER TABLE "ConditionReport" ADD COLUMN IF NOT EXISTS "meterReadings" JSONB;

ALTER TABLE "CheckoutProcess" ADD COLUMN IF NOT EXISTS "conditionReportId" TEXT;

ALTER TABLE "MaintenanceJob" ADD COLUMN IF NOT EXISTS "conditionReportId" TEXT;
CREATE INDEX IF NOT EXISTS "MaintenanceJob_conditionReportId_idx" ON "MaintenanceJob"("conditionReportId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MaintenanceJob_conditionReportId_fkey') THEN
    ALTER TABLE "MaintenanceJob" ADD CONSTRAINT "MaintenanceJob_conditionReportId_fkey"
      FOREIGN KEY ("conditionReportId") REFERENCES "ConditionReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "UnitTurnover" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "organizationId" TEXT,
  "tenantId" TEXT,
  "conditionReportId" TEXT,
  "checkoutId" TEXT,
  "items" JSONB NOT NULL DEFAULT '[]',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "completedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UnitTurnover_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UnitTurnover_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UnitTurnover_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UnitTurnover_conditionReportId_fkey" FOREIGN KEY ("conditionReportId") REFERENCES "ConditionReport"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "UnitTurnover_propertyId_completedAt_idx" ON "UnitTurnover"("propertyId", "completedAt");
CREATE INDEX IF NOT EXISTS "UnitTurnover_unitId_idx" ON "UnitTurnover"("unitId");
ALTER TABLE "UnitTurnover" ENABLE ROW LEVEL SECURITY;
