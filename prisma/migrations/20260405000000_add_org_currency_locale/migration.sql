-- AlterTable: add defaultCurrency and locale to Organization
ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "defaultCurrency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS "locale"           TEXT NOT NULL DEFAULT 'en-US';
