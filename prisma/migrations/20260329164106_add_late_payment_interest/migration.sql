-- AlterTable
ALTER TABLE "ManagementAgreement" ADD COLUMN     "latePaymentInterestRate" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "chargeLatePenalty" BOOLEAN NOT NULL DEFAULT false;
