-- Keys production already had but the schema didn't declare (found by
-- `npm run db:drift`). Declared so dev databases match: a deleted property /
-- organisation takes its automation overrides with it. No-op in production.

-- Overrides left behind by properties deleted before the FK existed (dev only).
DELETE FROM "AutomationPropertyOverride" o
WHERE NOT EXISTS (SELECT 1 FROM "Property" p WHERE p.id = o."propertyId")
   OR NOT EXISTS (SELECT 1 FROM "Organization" g WHERE g.id = o."organizationId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AutomationPropertyOverride_organizationId_fkey') THEN
    ALTER TABLE "AutomationPropertyOverride" ADD CONSTRAINT "AutomationPropertyOverride_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AutomationPropertyOverride_propertyId_fkey') THEN
    ALTER TABLE "AutomationPropertyOverride" ADD CONSTRAINT "AutomationPropertyOverride_propertyId_fkey"
      FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Portal-request filter (GET /api/maintenance?portalOnly=true).
CREATE INDEX IF NOT EXISTS "MaintenanceJob_submittedViaPortal_idx" ON "MaintenanceJob"("submittedViaPortal");
