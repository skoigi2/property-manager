-- CreateEnum
CREATE TYPE "VendorCategory" AS ENUM ('CONTRACTOR', 'SUPPLIER', 'UTILITY_PROVIDER', 'SERVICE_PROVIDER', 'CONSULTANT', 'OTHER');

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "category" "VendorCategory" NOT NULL DEFAULT 'OTHER',
    "phone" TEXT,
    "email" TEXT,
    "kraPin" TEXT,
    "bankDetails" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vendor_organizationId_idx" ON "Vendor"("organizationId");

-- CreateIndex
CREATE INDEX "Vendor_name_idx" ON "Vendor"("name");

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: add vendorId to ExpenseEntry
ALTER TABLE "ExpenseEntry" ADD COLUMN "vendorId" TEXT;

-- AlterTable: add vendorId to MaintenanceJob
ALTER TABLE "MaintenanceJob" ADD COLUMN "vendorId" TEXT;

-- AlterTable: add vendorId to AssetMaintenanceLog
ALTER TABLE "AssetMaintenanceLog" ADD COLUMN "vendorId" TEXT;

-- AlterTable: add vendorId to RecurringExpense
ALTER TABLE "RecurringExpense" ADD COLUMN "vendorId" TEXT;

-- AlterTable: add vendorId to Asset
ALTER TABLE "Asset" ADD COLUMN "vendorId" TEXT;

-- CreateIndex
CREATE INDEX "AssetMaintenanceLog_vendorId_idx" ON "AssetMaintenanceLog"("vendorId");

-- AddForeignKey
ALTER TABLE "ExpenseEntry" ADD CONSTRAINT "ExpenseEntry_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceJob" ADD CONSTRAINT "MaintenanceJob_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetMaintenanceLog" ADD CONSTRAINT "AssetMaintenanceLog_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
