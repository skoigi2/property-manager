-- Sample/demo property marker: stamped by the demo seeder. Managers may delete
-- demo properties; real property create/delete is admin-only.

-- AlterTable
ALTER TABLE "Property" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: flag already-seeded demo properties by their registry names
-- (src/lib/demo-definitions.ts).
UPDATE "Property" SET "isDemo" = true
WHERE "name" IN ('Al Seef Residences', 'Sandton Heights', 'Belsize Court', 'Kilimani Court');
