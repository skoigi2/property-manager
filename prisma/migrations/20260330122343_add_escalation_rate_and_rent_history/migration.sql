-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "escalationRate" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "RentHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "monthlyRent" DOUBLE PRECISION NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RentHistory_tenantId_idx" ON "RentHistory"("tenantId");

-- CreateIndex
CREATE INDEX "RentHistory_tenantId_effectiveDate_idx" ON "RentHistory"("tenantId", "effectiveDate");

-- AddForeignKey
ALTER TABLE "RentHistory" ADD CONSTRAINT "RentHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
