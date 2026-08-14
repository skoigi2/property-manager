-- Org-scope two resources that previously had no per-organisation isolation:
--
--   RecurringExpense — PORTFOLIO-scope templates carry no property/unit to
--   resolve an org through, so the list route's unconditional
--   `{ scope: "PORTFOLIO" }` arm returned every org's templates to every user.
--
--   AirbnbGuest — the model has no property link at all, so guest records and
--   their passport/ID documents were readable/editable across all orgs by any
--   authenticated manager.
--
-- Both gain a nullable `organizationId` stamped on create from the session.
-- Legacy rows are backfilled through their property (recurring) or their
-- bookings' property (guests); rows with no link at all stay null and remain
-- visible (grandfathered), mirroring the ExpenseEntry / PettyCash pattern.

ALTER TABLE "RecurringExpense" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "AirbnbGuest" ADD COLUMN "organizationId" TEXT;
CREATE INDEX "RecurringExpense_organizationId_idx" ON "RecurringExpense"("organizationId");
CREATE INDEX "AirbnbGuest_organizationId_idx" ON "AirbnbGuest"("organizationId");

-- ── Backfill: RecurringExpense ────────────────────────────────────────────────
-- Direct property link
UPDATE "RecurringExpense" r
SET "organizationId" = p."organizationId"
FROM "Property" p
WHERE r."propertyId" = p."id" AND r."organizationId" IS NULL AND p."organizationId" IS NOT NULL;

-- Via unit
UPDATE "RecurringExpense" r
SET "organizationId" = p."organizationId"
FROM "Unit" u JOIN "Property" p ON u."propertyId" = p."id"
WHERE r."unitId" = u."id" AND r."organizationId" IS NULL AND p."organizationId" IS NOT NULL;

-- ── Backfill: AirbnbGuest ─────────────────────────────────────────────────────
-- Resolve org through the guest's bookings: BookingGuest → IncomeEntry → Unit → Property.
-- A guest linked to multiple properties in one org resolves fine; the DISTINCT
-- keeps one org per guest (cross-org shared guests are not expected in practice).
UPDATE "AirbnbGuest" g
SET "organizationId" = sub."orgId"
FROM (
  SELECT DISTINCT bg."guestId", p."organizationId" AS "orgId"
  FROM "BookingGuest" bg
  JOIN "IncomeEntry" ie ON bg."incomeEntryId" = ie."id"
  JOIN "Unit" u ON ie."unitId" = u."id"
  JOIN "Property" p ON u."propertyId" = p."id"
  WHERE p."organizationId" IS NOT NULL
) sub
WHERE sub."guestId" = g."id" AND g."organizationId" IS NULL;
