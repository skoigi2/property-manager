/*
  Warnings:

  - Added the required column `updatedAt` to the `Property` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Unit` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "IncomeType" ADD VALUE 'UTILITY_RECOVERY';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UnitStatus" ADD VALUE 'LISTED';
ALTER TYPE "UnitStatus" ADD VALUE 'UNDER_NOTICE';
ALTER TYPE "UnitStatus" ADD VALUE 'MAINTENANCE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UnitType" ADD VALUE 'BEDSITTER';
ALTER TYPE "UnitType" ADD VALUE 'THREE_BED';
ALTER TYPE "UnitType" ADD VALUE 'FOUR_BED';
ALTER TYPE "UnitType" ADD VALUE 'PENTHOUSE';
ALTER TYPE "UnitType" ADD VALUE 'COMMERCIAL';
ALTER TYPE "UnitType" ADD VALUE 'OTHER';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'ACCOUNTANT';

-- AlterTable
ALTER TABLE "PettyCash" ADD COLUMN     "propertyId" TEXT;

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT DEFAULT 'Nairobi',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "managementFeeFlat" DOUBLE PRECISION,
ADD COLUMN     "managementFeeRate" DOUBLE PRECISION,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "serviceChargeDefault" DOUBLE PRECISION,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();
ALTER TABLE "Property" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "depositPaidDate" TIMESTAMP(3),
ADD COLUMN     "email" TEXT,
ADD COLUMN     "kraPinNumber" TEXT,
ADD COLUMN     "nationalId" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "rentDueDay" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "vacatedDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "amenities" TEXT[],
ADD COLUMN     "description" TEXT,
ADD COLUMN     "floor" INTEGER,
ADD COLUMN     "sizeSqm" DOUBLE PRECISION,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();
ALTER TABLE "Unit" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "PropertyAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyAccess_userId_propertyId_key" ON "PropertyAccess"("userId", "propertyId");

-- CreateIndex
CREATE INDEX "ExpenseEntry_date_idx" ON "ExpenseEntry"("date");

-- CreateIndex
CREATE INDEX "ExpenseEntry_propertyId_date_idx" ON "ExpenseEntry"("propertyId", "date");

-- CreateIndex
CREATE INDEX "IncomeEntry_date_idx" ON "IncomeEntry"("date");

-- CreateIndex
CREATE INDEX "IncomeEntry_unitId_date_idx" ON "IncomeEntry"("unitId", "date");

-- AddForeignKey
ALTER TABLE "PropertyAccess" ADD CONSTRAINT "PropertyAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyAccess" ADD CONSTRAINT "PropertyAccess_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCash" ADD CONSTRAINT "PettyCash_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
