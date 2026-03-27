-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IncomeType" ADD VALUE 'LETTING_FEE';
ALTER TYPE "IncomeType" ADD VALUE 'RENEWAL_FEE';
ALTER TYPE "IncomeType" ADD VALUE 'VACANCY_FEE';
ALTER TYPE "IncomeType" ADD VALUE 'SETUP_FEE_INSTALMENT';
ALTER TYPE "IncomeType" ADD VALUE 'CONSULTANCY_FEE';

-- AlterTable
ALTER TABLE "MaintenanceJob" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "approvalNotes" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "isEmergency" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresApproval" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "vacantSince" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ManagementAgreement" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "managementFeeRate" DOUBLE PRECISION NOT NULL DEFAULT 8.5,
    "vacancyFeeRate" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "vacancyFeeThresholdMonths" INTEGER NOT NULL DEFAULT 9,
    "newLettingFeeRate" DOUBLE PRECISION NOT NULL DEFAULT 50.0,
    "leaseRenewalFeeFlat" DOUBLE PRECISION NOT NULL DEFAULT 3000,
    "shortTermLettingFeeRate" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "repairAuthorityLimit" DOUBLE PRECISION NOT NULL DEFAULT 100000,
    "setupFeeTotal" DOUBLE PRECISION,
    "setupFeeInstalments" INTEGER NOT NULL DEFAULT 3,
    "rentRemittanceDay" INTEGER NOT NULL DEFAULT 5,
    "mgmtFeeInvoiceDay" INTEGER NOT NULL DEFAULT 7,
    "landlordPaymentDays" INTEGER NOT NULL DEFAULT 2,
    "kpiStartDate" TIMESTAMP(3),
    "kpiOccupancyTarget" DOUBLE PRECISION NOT NULL DEFAULT 90,
    "kpiRentCollectionTarget" DOUBLE PRECISION NOT NULL DEFAULT 90,
    "kpiExpenseRatioTarget" DOUBLE PRECISION NOT NULL DEFAULT 85,
    "kpiTenantTurnoverTarget" DOUBLE PRECISION NOT NULL DEFAULT 90,
    "kpiDaysToLeaseTarget" INTEGER NOT NULL DEFAULT 60,
    "kpiRenewalRateTarget" DOUBLE PRECISION NOT NULL DEFAULT 90,
    "kpiMaintenanceCompletionTarget" DOUBLE PRECISION NOT NULL DEFAULT 95,
    "kpiEmergencyResponseHrs" INTEGER NOT NULL DEFAULT 24,
    "kpiStandardResponseHrs" INTEGER NOT NULL DEFAULT 96,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagementAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildingConditionReport" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "inspector" TEXT,
    "overallCondition" TEXT NOT NULL,
    "summary" TEXT,
    "items" JSONB,
    "nextReviewDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuildingConditionReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManagementAgreement_propertyId_key" ON "ManagementAgreement"("propertyId");

-- CreateIndex
CREATE INDEX "ManagementAgreement_propertyId_idx" ON "ManagementAgreement"("propertyId");

-- CreateIndex
CREATE INDEX "BuildingConditionReport_propertyId_idx" ON "BuildingConditionReport"("propertyId");

-- CreateIndex
CREATE INDEX "BuildingConditionReport_reportDate_idx" ON "BuildingConditionReport"("reportDate");

-- AddForeignKey
ALTER TABLE "ManagementAgreement" ADD CONSTRAINT "ManagementAgreement_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildingConditionReport" ADD CONSTRAINT "BuildingConditionReport_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
