-- Unit owners who pay only the service charge on a managed development.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "isUnitOwner" BOOLEAN NOT NULL DEFAULT false;
