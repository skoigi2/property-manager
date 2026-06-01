-- CreateTable
CREATE TABLE IF NOT EXISTS "AutomationPropertyOverride" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "automationKey" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationPropertyOverride_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "AutomationPropertyOverride_automationKey_propertyId_key" ON "AutomationPropertyOverride"("automationKey","propertyId");
CREATE INDEX IF NOT EXISTS "AutomationPropertyOverride_organizationId_idx" ON "AutomationPropertyOverride"("organizationId");
CREATE INDEX IF NOT EXISTS "AutomationPropertyOverride_propertyId_idx" ON "AutomationPropertyOverride"("propertyId");

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "AutomationPropertyOverride" ADD CONSTRAINT "AutomationPropertyOverride_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "AutomationPropertyOverride" ADD CONSTRAINT "AutomationPropertyOverride_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Enable RLS
ALTER TABLE "AutomationPropertyOverride" ENABLE ROW LEVEL SECURITY;
