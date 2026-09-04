-- Insurance policy documents: category (valuation report, insurer assessment,
-- policy schedule…), the date the document speaks to, and who uploaded it.
DO $$ BEGIN
  CREATE TYPE "InsuranceDocumentCategory" AS ENUM (
    'POLICY_SCHEDULE', 'CERTIFICATE', 'VALUATION_REPORT', 'INSURER_ASSESSMENT', 'CLAIM', 'INVOICE_RECEIPT', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "InsurancePolicyDocument"
  ADD COLUMN IF NOT EXISTS "category" "InsuranceDocumentCategory" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN IF NOT EXISTS "documentDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "uploadedByEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "uploadedByName" TEXT;
