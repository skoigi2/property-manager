-- Link petty-cash OUT rows to the expense that created them, so deleting the
-- expense (single, bulk, or delete-all) cascades and the ledger stays in sync.
-- Historical rows keep NULL and behave as before.

ALTER TABLE "PettyCash" ADD COLUMN "expenseEntryId" TEXT;

CREATE UNIQUE INDEX "PettyCash_expenseEntryId_key" ON "PettyCash"("expenseEntryId");

ALTER TABLE "PettyCash"
  ADD CONSTRAINT "PettyCash_expenseEntryId_fkey"
  FOREIGN KEY ("expenseEntryId") REFERENCES "ExpenseEntry"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
