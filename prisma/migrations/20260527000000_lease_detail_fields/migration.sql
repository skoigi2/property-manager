-- New first-class fields for lease detail that was previously stored in tenant notes:
-- Property: landlord legal entity + per-property bank override (defaults to org bank if null).
-- Unit: title reference (LR number / title deed identifier).
-- Tenant: rent payment cadence + parking fee line item.

CREATE TYPE "PaymentFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'BIANNUAL', 'ANNUAL');

ALTER TABLE "Property" ADD COLUMN "landlordEntity"    TEXT;
ALTER TABLE "Property" ADD COLUMN "bankName"          TEXT;
ALTER TABLE "Property" ADD COLUMN "bankAccountName"   TEXT;
ALTER TABLE "Property" ADD COLUMN "bankAccountNumber" TEXT;

ALTER TABLE "Unit" ADD COLUMN "titleReference" TEXT;

ALTER TABLE "Tenant" ADD COLUMN "paymentFrequency" "PaymentFrequency";
ALTER TABLE "Tenant" ADD COLUMN "parkingFee"       DOUBLE PRECISION;
