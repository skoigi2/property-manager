-- Hot-path indexes — additive, no data migration.
-- Most perf-relevant indexes (IncomeEntry unitId+date, IncomeEntry tenantId,
-- ExpenseEntry propertyId+date) already exist on the schema. The only
-- materially missing ones are on Invoice — the operational inbox and arrears
-- screens both filter unpaid invoices by dueDate.

CREATE INDEX IF NOT EXISTS "Invoice_dueDate_idx"        ON "Invoice" ("dueDate");
CREATE INDEX IF NOT EXISTS "Invoice_status_dueDate_idx" ON "Invoice" ("status", "dueDate");
