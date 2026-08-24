-- Line items: transaction-charge category + per-line payment date.
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block —
-- keep it as a separate top-level statement.
ALTER TYPE "LineItemCategory" ADD VALUE IF NOT EXISTS 'TRANSACTION_CHARGE';

ALTER TABLE "ExpenseLineItem" ADD COLUMN "paymentDate" TIMESTAMP(3);
