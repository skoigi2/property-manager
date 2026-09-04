-- Asset documents: category (warranty, manual, service report…), the date the
-- document speaks to, and who uploaded it. Assets: replacement value.
DO $$ BEGIN
  CREATE TYPE "AssetDocumentCategory" AS ENUM (
    'WARRANTY', 'MANUAL', 'INVOICE_RECEIPT', 'SERVICE_REPORT', 'CERTIFICATE', 'PHOTO', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "AssetDocument"
  ADD COLUMN IF NOT EXISTS "category" "AssetDocumentCategory" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN IF NOT EXISTS "documentDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "uploadedByEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "uploadedByName" TEXT;

ALTER TABLE "Asset"
  ADD COLUMN IF NOT EXISTS "replacementValue" DECIMAL(14,2);
