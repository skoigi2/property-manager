-- Payment Accounts: named bank/M-Pesa destinations reusable across properties,
-- with a property-level default (ManagementAgreement) and per-unit override.
-- Invoices resolve: unit override → property default → legacy inline agreement
-- fields → organisation branding.

CREATE TABLE "PaymentAccount" (
  "id"                  TEXT NOT NULL,
  "organizationId"      TEXT NOT NULL,
  "name"                TEXT NOT NULL,
  "bankName"            TEXT,
  "bankAccountName"     TEXT,
  "bankAccountNumber"   TEXT,
  "bankBranch"          TEXT,
  "mpesaPaybill"        TEXT,
  "mpesaAccountNumber"  TEXT,
  "mpesaTill"           TEXT,
  "paymentInstructions" TEXT,
  "isActive"            BOOLEAN NOT NULL DEFAULT true,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentAccount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentAccount_organizationId_idx" ON "PaymentAccount"("organizationId");

ALTER TABLE "PaymentAccount"
  ADD CONSTRAINT "PaymentAccount_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManagementAgreement" ADD COLUMN "paymentAccountId" TEXT;
ALTER TABLE "ManagementAgreement"
  ADD CONSTRAINT "ManagementAgreement_paymentAccountId_fkey"
  FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Unit" ADD COLUMN "paymentAccountId" TEXT;
ALTER TABLE "Unit"
  ADD CONSTRAINT "Unit_paymentAccountId_fkey"
  FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Enable RLS to match the rest of the schema (Supabase requirement).
ALTER TABLE "PaymentAccount" ENABLE ROW LEVEL SECURITY;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Every agreement that already carries inline tenant payment details becomes a
-- named account ("<Property> — default") linked as that property's default, so
-- existing users see no change and can manage the account from the new UI.
-- Account ids derive deterministically from the agreement id ('pa_' prefix),
-- which makes the linking unambiguous and the backfill idempotent.
INSERT INTO "PaymentAccount" (
  "id", "organizationId", "name",
  "bankName", "bankAccountName", "bankAccountNumber", "bankBranch",
  "mpesaPaybill", "mpesaAccountNumber", "mpesaTill", "paymentInstructions",
  "updatedAt"
)
SELECT
  'pa_' || a."id",
  p."organizationId",
  p."name" || ' — default',
  a."tenantBankName", a."tenantBankAccountName", a."tenantBankAccountNumber", a."tenantBankBranch",
  a."tenantMpesaPaybill", a."tenantMpesaAccountNumber", a."tenantMpesaTill", a."tenantPaymentInstructions",
  CURRENT_TIMESTAMP
FROM "ManagementAgreement" a
JOIN "Property" p ON p."id" = a."propertyId"
WHERE p."organizationId" IS NOT NULL
  AND (
    a."tenantBankName" IS NOT NULL OR a."tenantBankAccountNumber" IS NOT NULL
    OR a."tenantMpesaPaybill" IS NOT NULL OR a."tenantMpesaTill" IS NOT NULL
  )
ON CONFLICT ("id") DO NOTHING;

UPDATE "ManagementAgreement" a
SET "paymentAccountId" = 'pa_' || a."id"
WHERE a."paymentAccountId" IS NULL
  AND EXISTS (SELECT 1 FROM "PaymentAccount" pa WHERE pa."id" = 'pa_' || a."id");
