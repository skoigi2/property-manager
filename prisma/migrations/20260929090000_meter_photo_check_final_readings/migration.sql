-- Meter photo check: what Claude read off the reading's photo(s).
ALTER TABLE "MeterReading" ADD COLUMN "photoReading" DOUBLE PRECISION;
ALTER TABLE "MeterReading" ADD COLUMN "photoReadingNote" TEXT;
ALTER TABLE "MeterReading" ADD COLUMN "photoCheckedAt" TIMESTAMP(3);

-- Move-out meter readings on the tenant checkout.
ALTER TABLE "CheckoutProcess" ADD COLUMN "finalMeterReadings" JSONB;
ALTER TABLE "CheckoutProcess" ADD COLUMN "finalUtilitiesAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "CheckoutProcess" ADD COLUMN "finalUtilitiesInvoiceId" TEXT;
