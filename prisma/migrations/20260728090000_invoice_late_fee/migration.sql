-- Invoice late fee: manager-triggered penalty posted onto the invoice.
-- lateFeeAmount is included in totalAmount once applied; lateFeeAppliedAt
-- doubles as the "already applied" guard (null = no fee).
ALTER TABLE "Invoice" ADD COLUMN "lateFeeAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN "lateFeeAppliedAt" TIMESTAMP(3);
