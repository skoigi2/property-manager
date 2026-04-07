-- Add per-property payment detail fields to ManagementAgreement
-- tenant* fields appear on tenant rent invoices; mgmt* fields appear on owner invoices

ALTER TABLE "ManagementAgreement"
  ADD COLUMN IF NOT EXISTS "tenantBankName"            TEXT,
  ADD COLUMN IF NOT EXISTS "tenantBankAccountName"     TEXT,
  ADD COLUMN IF NOT EXISTS "tenantBankAccountNumber"   TEXT,
  ADD COLUMN IF NOT EXISTS "tenantBankBranch"          TEXT,
  ADD COLUMN IF NOT EXISTS "tenantMpesaPaybill"        TEXT,
  ADD COLUMN IF NOT EXISTS "tenantMpesaAccountNumber"  TEXT,
  ADD COLUMN IF NOT EXISTS "tenantMpesaTill"           TEXT,
  ADD COLUMN IF NOT EXISTS "tenantPaymentInstructions" TEXT,
  ADD COLUMN IF NOT EXISTS "mgmtBankName"              TEXT,
  ADD COLUMN IF NOT EXISTS "mgmtBankAccountName"       TEXT,
  ADD COLUMN IF NOT EXISTS "mgmtBankAccountNumber"     TEXT,
  ADD COLUMN IF NOT EXISTS "mgmtBankBranch"            TEXT,
  ADD COLUMN IF NOT EXISTS "mgmtMpesaPaybill"          TEXT,
  ADD COLUMN IF NOT EXISTS "mgmtMpesaAccountNumber"    TEXT,
  ADD COLUMN IF NOT EXISTS "mgmtMpesaTill"             TEXT,
  ADD COLUMN IF NOT EXISTS "mgmtPaymentInstructions"   TEXT;
