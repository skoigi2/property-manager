-- Add payment detail fields to Organization
ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "bankName"            TEXT,
  ADD COLUMN IF NOT EXISTS "bankAccountName"     TEXT,
  ADD COLUMN IF NOT EXISTS "bankAccountNumber"   TEXT,
  ADD COLUMN IF NOT EXISTS "bankBranch"          TEXT,
  ADD COLUMN IF NOT EXISTS "mpesaPaybill"        TEXT,
  ADD COLUMN IF NOT EXISTS "mpesaAccountNumber"  TEXT,
  ADD COLUMN IF NOT EXISTS "mpesaTill"           TEXT,
  ADD COLUMN IF NOT EXISTS "paymentInstructions" TEXT;
