-- Custom invoice numbering series + payment-account identity contacts.
--
-- Numbering: each organisation gets a default series (format + counter);
-- a payment account with its own invoiceFormat runs its own series, so a
-- different landlord company keeps unbroken numbering. This replaces the old
-- global invoice-count numbering (which spanned all organisations and could
-- collide after deletions).

ALTER TABLE "Organization" ADD COLUMN "invoiceFormat" TEXT;
ALTER TABLE "Organization" ADD COLUMN "invoiceNextNumber" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "PaymentAccount" ADD COLUMN "address" TEXT;
ALTER TABLE "PaymentAccount" ADD COLUMN "phone" TEXT;
ALTER TABLE "PaymentAccount" ADD COLUMN "email" TEXT;
ALTER TABLE "PaymentAccount" ADD COLUMN "invoiceFormat" TEXT;
ALTER TABLE "PaymentAccount" ADD COLUMN "invoiceNextNumber" INTEGER NOT NULL DEFAULT 1;

-- Backfill: continue each organisation's sequence from its existing invoice
-- count so numbers don't restart at 0001 (idempotent enough — only lifts the
-- counter when it is still at the default).
UPDATE "Organization" o
SET "invoiceNextNumber" = sub.cnt + 1
FROM (
  SELECT p."organizationId" AS org_id, COUNT(i."id") AS cnt
  FROM "Invoice" i
  JOIN "Tenant" t ON t."id" = i."tenantId"
  JOIN "Unit" u ON u."id" = t."unitId"
  JOIN "Property" p ON p."id" = u."propertyId"
  WHERE p."organizationId" IS NOT NULL
  GROUP BY p."organizationId"
) sub
WHERE o."id" = sub.org_id
  AND o."invoiceNextNumber" = 1;
