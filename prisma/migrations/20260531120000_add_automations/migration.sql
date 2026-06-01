-- CreateTable
CREATE TABLE IF NOT EXISTS "AutomationTemplate" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AutomationExecution" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "automationKey" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "AutomationTemplate_organizationId_key_key" ON "AutomationTemplate"("organizationId","key");
CREATE INDEX IF NOT EXISTS "AutomationTemplate_organizationId_idx" ON "AutomationTemplate"("organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "AutomationExecution_automationKey_subjectId_key" ON "AutomationExecution"("automationKey","subjectId");
CREATE INDEX IF NOT EXISTS "AutomationExecution_organizationId_idx" ON "AutomationExecution"("organizationId");

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "AutomationTemplate" ADD CONSTRAINT "AutomationTemplate_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Enable RLS
ALTER TABLE "AutomationTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationExecution" ENABLE ROW LEVEL SECURITY;
