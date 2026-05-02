-- Add organizationId to Agent so agents are org-scoped (was a global table — cross-org leak).
-- Existing rows are left with NULL organizationId; org users will not see them after this migration.
-- A super-admin can reassign or delete unattached agent rows via Prisma Studio or a follow-up script.

ALTER TABLE "Agent" ADD COLUMN "organizationId" TEXT;

ALTER TABLE "Agent"
  ADD CONSTRAINT "Agent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Agent_organizationId_idx" ON "Agent"("organizationId");
