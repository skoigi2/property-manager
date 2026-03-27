-- CreateEnum
CREATE TYPE "OwnerInvoiceType" AS ENUM ('LETTING_FEE', 'PERIODIC_LETTING_FEE', 'RENEWAL_FEE', 'MANAGEMENT_FEE', 'VACANCY_FEE', 'SETUP_FEE_INSTALMENT', 'CONSULTANCY_FEE');

-- AlterTable
ALTER TABLE "IncomeEntry" ADD COLUMN     "ownerInvoiceId" TEXT;

-- CreateTable
CREATE TABLE "OwnerInvoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "ownerId" TEXT,
    "type" "OwnerInvoiceType" NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "lineItems" JSONB NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "paidAt" TIMESTAMP(3),
    "paidAmount" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OwnerInvoice_invoiceNumber_key" ON "OwnerInvoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "OwnerInvoice_propertyId_idx" ON "OwnerInvoice"("propertyId");

-- CreateIndex
CREATE INDEX "OwnerInvoice_status_idx" ON "OwnerInvoice"("status");

-- CreateIndex
CREATE INDEX "OwnerInvoice_periodYear_periodMonth_idx" ON "OwnerInvoice"("periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "IncomeEntry_ownerInvoiceId_idx" ON "IncomeEntry"("ownerInvoiceId");

-- AddForeignKey
ALTER TABLE "IncomeEntry" ADD CONSTRAINT "IncomeEntry_ownerInvoiceId_fkey" FOREIGN KEY ("ownerInvoiceId") REFERENCES "OwnerInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerInvoice" ADD CONSTRAINT "OwnerInvoice_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerInvoice" ADD CONSTRAINT "OwnerInvoice_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
