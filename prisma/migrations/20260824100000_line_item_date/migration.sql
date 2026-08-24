-- Optional per-line charge/service date — one invoice often covers work done
-- on different days. Informational: the parent expense's date still decides
-- the P&L month.
ALTER TABLE "ExpenseLineItem" ADD COLUMN "date" TIMESTAMP(3);
