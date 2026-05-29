-- VAT captured as its own field on an expense (previously only carried in the
-- description text). Amount stays net/pre-VAT; vatAmount is the tax portion.

ALTER TABLE "ExpenseEntry" ADD COLUMN "vatAmount" DOUBLE PRECISION;
