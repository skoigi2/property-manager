-- AlterTable
ALTER TABLE "ExpenseEntry" ADD COLUMN     "paidFromPettyCash" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "IncomeEntry" ADD COLUMN     "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "IncomeEntry_tenantId_idx" ON "IncomeEntry"("tenantId");

-- AddForeignKey
ALTER TABLE "IncomeEntry" ADD CONSTRAINT "IncomeEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
