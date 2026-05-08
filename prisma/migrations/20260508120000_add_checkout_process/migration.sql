-- Checkout / Move-Out workflow

-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "RefundMethod" AS ENUM ('CHEQUE', 'CASH', 'MOBILE_TRANSFER', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "CheckoutDeductionCategory" AS ENUM ('UTILITY', 'SERVICE_CHARGE', 'RENT_BALANCE', 'DAMAGE', 'OTHER');

-- CreateTable
CREATE TABLE "CheckoutProcess" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "organizationId" TEXT,
    "checkOutDate" TIMESTAMP(3) NOT NULL,
    "damageFound" BOOLEAN NOT NULL DEFAULT false,
    "inventoryDamageAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inventoryDamageNotes" TEXT,
    "damageKeptByLandlord" BOOLEAN NOT NULL DEFAULT true,
    "rentBalanceOwing" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rentBalanceSource" TEXT,
    "originalDeposit" DOUBLE PRECISION NOT NULL,
    "totalDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceToRefund" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "keysReturned" JSONB,
    "utilityTransfers" JSONB,
    "refundMethod" "RefundMethod",
    "refundDetails" JSONB,
    "notes" TEXT,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "finalizedAt" TIMESTAMP(3),
    "finalizedByUserId" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "expenseEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutDeduction" (
    "id" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" "CheckoutDeductionCategory" NOT NULL DEFAULT 'OTHER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckoutDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutProcess_tenantId_key" ON "CheckoutProcess"("tenantId");

-- CreateIndex
CREATE INDEX "CheckoutProcess_propertyId_idx" ON "CheckoutProcess"("propertyId");

-- CreateIndex
CREATE INDEX "CheckoutProcess_unitId_idx" ON "CheckoutProcess"("unitId");

-- CreateIndex
CREATE INDEX "CheckoutProcess_status_idx" ON "CheckoutProcess"("status");

-- CreateIndex
CREATE INDEX "CheckoutDeduction_checkoutId_idx" ON "CheckoutDeduction"("checkoutId");

-- AddForeignKey
ALTER TABLE "CheckoutProcess" ADD CONSTRAINT "CheckoutProcess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutProcess" ADD CONSTRAINT "CheckoutProcess_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutProcess" ADD CONSTRAINT "CheckoutProcess_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutProcess" ADD CONSTRAINT "CheckoutProcess_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutDeduction" ADD CONSTRAINT "CheckoutDeduction_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "CheckoutProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;
