-- Snapshot of the DEPOSIT receipts sum used as the settlement base at
-- checkout finalize. Null = no receipt trail (fell back to contractual
-- originalDeposit), which is also the correct reading for all existing rows.
ALTER TABLE "CheckoutProcess" ADD COLUMN "depositReceived" DECIMAL(14,2);
