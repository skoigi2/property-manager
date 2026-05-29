-- Expense-level outstanding-balance tracking.
-- Single-amount expenses (no line items) previously had no payment status;
-- amountPaid + dueDate let every expense report a paid/partial/unpaid balance.
-- Status/outstanding are derived at read time (see src/lib/calculations.ts), not stored.

ALTER TABLE "ExpenseEntry" ADD COLUMN "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ExpenseEntry" ADD COLUMN "dueDate" TIMESTAMP(3);
