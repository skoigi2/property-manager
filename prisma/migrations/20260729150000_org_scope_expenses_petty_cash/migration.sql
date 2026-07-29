-- Org-scope financial rows that have no property to resolve through.
-- ExpenseEntry / PettyCash gain organizationId (stamped on create from the
-- session), so PORTFOLIO-scope expenses and unassigned petty-cash entries can
-- be isolated per organisation instead of being visible to every org's
-- managers. Legacy rows are backfilled through their property/unit/allocation
-- links; rows with no link at all stay null and remain visible (grandfathered).

ALTER TABLE "ExpenseEntry" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "PettyCash" ADD COLUMN "organizationId" TEXT;
CREATE INDEX "ExpenseEntry_organizationId_idx" ON "ExpenseEntry"("organizationId");
CREATE INDEX "PettyCash_organizationId_idx" ON "PettyCash"("organizationId");

-- ── Backfill ──────────────────────────────────────────────────────────────────
-- Direct property link
UPDATE "ExpenseEntry" e
SET "organizationId" = p."organizationId"
FROM "Property" p
WHERE e."propertyId" = p."id" AND e."organizationId" IS NULL AND p."organizationId" IS NOT NULL;

-- Via unit
UPDATE "ExpenseEntry" e
SET "organizationId" = p."organizationId"
FROM "Unit" u JOIN "Property" p ON u."propertyId" = p."id"
WHERE e."unitId" = u."id" AND e."organizationId" IS NULL AND p."organizationId" IS NOT NULL;

-- Via multi-unit allocations
UPDATE "ExpenseEntry" e
SET "organizationId" = sub."orgId"
FROM (
  SELECT DISTINCT a."expenseId", p."organizationId" AS "orgId"
  FROM "ExpenseUnitAllocation" a
  JOIN "Unit" u ON a."unitId" = u."id"
  JOIN "Property" p ON u."propertyId" = p."id"
  WHERE p."organizationId" IS NOT NULL
) sub
WHERE sub."expenseId" = e."id" AND e."organizationId" IS NULL;

-- Petty cash: direct property link
UPDATE "PettyCash" pc
SET "organizationId" = p."organizationId"
FROM "Property" p
WHERE pc."propertyId" = p."id" AND pc."organizationId" IS NULL AND p."organizationId" IS NOT NULL;

-- Petty cash: via the linked expense (paid-from-petty-cash rows)
UPDATE "PettyCash" pc
SET "organizationId" = e."organizationId"
FROM "ExpenseEntry" e
WHERE pc."expenseEntryId" = e."id" AND pc."organizationId" IS NULL AND e."organizationId" IS NOT NULL;
