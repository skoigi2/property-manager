-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('LEASE_AGREEMENT', 'ID_COPY', 'KRA_PIN', 'PAYMENT_RECEIPT', 'RENEWAL_NOTICE', 'CORRESPONDENCE', 'OTHER');

-- CreateEnum
CREATE TYPE "RenewalStage" AS ENUM ('NONE', 'NOTICE_SENT', 'TERMS_AGREED', 'RENEWED');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "proposedLeaseEnd" TIMESTAMP(3),
ADD COLUMN     "proposedRent" DOUBLE PRECISION,
ADD COLUMN     "renewalNotes" TEXT,
ADD COLUMN     "renewalStage" "RenewalStage" NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "TenantDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL DEFAULT 'OTHER',
    "label" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantDocument_tenantId_idx" ON "TenantDocument"("tenantId");

-- AddForeignKey
ALTER TABLE "TenantDocument" ADD CONSTRAINT "TenantDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
