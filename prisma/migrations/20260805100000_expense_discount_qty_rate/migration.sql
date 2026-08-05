-- Expense enhancements: discount tracking + optional qty × rate on line items.
--
-- discountAmount (ExpenseEntry + ExpenseLineItem) is INFORMATIONAL ONLY — the
-- value of a discount received from the vendor. `amount` is already
-- net-of-discount (what was actually charged, pre-VAT); discountAmount is never
-- subtracted from `amount` and never enters any total. List price for
-- reporting is reconstructed as amount + discountAmount.
--
-- quantity / unitRate (ExpenseLineItem) are the optional inputs that derive
-- `amount` (round(quantity * unitRate, 2)) when both are present; `amount`
-- remains the stored net figure everything downstream reads.
--
-- All columns nullable — every existing row keeps working with them null.

ALTER TABLE "ExpenseEntry"    ADD COLUMN "discountAmount" DECIMAL(14,2);
ALTER TABLE "ExpenseLineItem" ADD COLUMN "quantity"       DOUBLE PRECISION;
ALTER TABLE "ExpenseLineItem" ADD COLUMN "unitRate"       DECIMAL(14,2);
ALTER TABLE "ExpenseLineItem" ADD COLUMN "discountAmount" DECIMAL(14,2);
