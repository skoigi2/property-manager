-- AlterTable
ALTER TABLE "AssetMaintenanceLog" ADD COLUMN     "expenseId" TEXT;

-- CreateIndex
CREATE INDEX "AssetMaintenanceLog_expenseId_idx" ON "AssetMaintenanceLog"("expenseId");

-- AddForeignKey
ALTER TABLE "AssetMaintenanceLog" ADD CONSTRAINT "AssetMaintenanceLog_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "ExpenseEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
