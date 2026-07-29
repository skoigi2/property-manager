-- Expense receipt upload upgrade: content-hash dedupe + uploader attribution.
-- checksum is null on legacy rows (Postgres treats nulls as distinct in the
-- unique index, so existing duplicates are unaffected).
ALTER TABLE "ExpenseDocument" ADD COLUMN "checksum" TEXT;
ALTER TABLE "ExpenseDocument" ADD COLUMN "uploadedByEmail" TEXT;
ALTER TABLE "ExpenseDocument" ADD COLUMN "uploadedByName" TEXT;
CREATE UNIQUE INDEX "ExpenseDocument_expenseId_checksum_key" ON "ExpenseDocument"("expenseId", "checksum");
