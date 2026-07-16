-- Track which RecurringExpense template materialised an ExpenseEntry, so the
-- Expenses page can show a "Recurring" origin badge. SET NULL keeps historical
-- entries when a template is deleted.

ALTER TABLE "ExpenseEntry" ADD COLUMN "recurringExpenseId" TEXT;

CREATE INDEX "ExpenseEntry_recurringExpenseId_idx" ON "ExpenseEntry"("recurringExpenseId");

ALTER TABLE "ExpenseEntry"
  ADD CONSTRAINT "ExpenseEntry_recurringExpenseId_fkey"
  FOREIGN KEY ("recurringExpenseId") REFERENCES "RecurringExpense"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
