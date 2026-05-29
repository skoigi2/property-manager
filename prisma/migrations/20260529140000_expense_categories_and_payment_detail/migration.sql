-- More property-typical expense categories, and payment-detail fields captured
-- from handover spreadsheets (payment mode / reference / actual payment date / comments).

ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'SECURITY';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'GARBAGE_COLLECTION';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'LANDSCAPING';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'PEST_CONTROL';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'INSURANCE';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'PROPERTY_TAX';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'LEGAL_FEES';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'LICENSE_PERMIT';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'MARKETING';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'BANK_CHARGES';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'STAFF_WAGES';

ALTER TABLE "ExpenseEntry" ADD COLUMN "paymentMethod"    "PaymentMethod";
ALTER TABLE "ExpenseEntry" ADD COLUMN "paymentReference" TEXT;
ALTER TABLE "ExpenseEntry" ADD COLUMN "paymentDate"      TIMESTAMP(3);
ALTER TABLE "ExpenseEntry" ADD COLUMN "notes"            TEXT;
