-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IncomeType" ADD VALUE 'SERVICE_CHARGE';
ALTER TYPE "IncomeType" ADD VALUE 'DEPOSIT';

-- AlterTable
ALTER TABLE "IncomeEntry" ADD COLUMN     "invoiceId" TEXT;

-- CreateIndex
CREATE INDEX "IncomeEntry_invoiceId_idx" ON "IncomeEntry"("invoiceId");

-- AddForeignKey
ALTER TABLE "IncomeEntry" ADD CONSTRAINT "IncomeEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
