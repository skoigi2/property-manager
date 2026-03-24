-- AlterTable
ALTER TABLE "IncomeEntry" ADD COLUMN     "commissionPaidAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DepositSettlement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "depositHeld" DOUBLE PRECISION NOT NULL,
    "deductions" JSONB NOT NULL DEFAULT '[]',
    "totalDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netRefunded" DOUBLE PRECISION NOT NULL,
    "settledDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DepositSettlement_tenantId_key" ON "DepositSettlement"("tenantId");

-- CreateIndex
CREATE INDEX "DepositSettlement_tenantId_idx" ON "DepositSettlement"("tenantId");

-- AddForeignKey
ALTER TABLE "DepositSettlement" ADD CONSTRAINT "DepositSettlement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
