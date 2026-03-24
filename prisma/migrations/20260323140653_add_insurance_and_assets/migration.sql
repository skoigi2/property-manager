-- CreateEnum
CREATE TYPE "InsuranceType" AS ENUM ('BUILDING', 'PUBLIC_LIABILITY', 'CONTENTS', 'OTHER');

-- CreateEnum
CREATE TYPE "PremiumFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'BIANNUALLY', 'ANNUALLY');

-- CreateEnum
CREATE TYPE "AssetCategory" AS ENUM ('GENERATOR', 'LIFT', 'HVAC', 'ELECTRICAL', 'PLUMBING', 'SECURITY', 'APPLIANCE', 'FURNITURE', 'IT_EQUIPMENT', 'VEHICLE', 'OTHER');

-- CreateTable
CREATE TABLE "InsurancePolicy" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "type" "InsuranceType" NOT NULL,
    "typeOther" TEXT,
    "insurer" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "premiumAmount" DOUBLE PRECISION,
    "premiumFrequency" "PremiumFrequency",
    "coverageAmount" DOUBLE PRECISION,
    "brokerName" TEXT,
    "brokerContact" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsurancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsurancePolicyDocument" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsurancePolicyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "name" TEXT NOT NULL,
    "category" "AssetCategory" NOT NULL,
    "categoryOther" TEXT,
    "serialNumber" TEXT,
    "modelNumber" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "purchaseCost" DOUBLE PRECISION,
    "warrantyExpiry" TIMESTAMP(3),
    "serviceProvider" TEXT,
    "serviceContact" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetDocument" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsurancePolicy_propertyId_idx" ON "InsurancePolicy"("propertyId");

-- CreateIndex
CREATE INDEX "InsurancePolicy_endDate_idx" ON "InsurancePolicy"("endDate");

-- CreateIndex
CREATE INDEX "InsurancePolicyDocument_policyId_idx" ON "InsurancePolicyDocument"("policyId");

-- CreateIndex
CREATE INDEX "Asset_propertyId_idx" ON "Asset"("propertyId");

-- CreateIndex
CREATE INDEX "Asset_warrantyExpiry_idx" ON "Asset"("warrantyExpiry");

-- CreateIndex
CREATE INDEX "AssetDocument_assetId_idx" ON "AssetDocument"("assetId");

-- AddForeignKey
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePolicyDocument" ADD CONSTRAINT "InsurancePolicyDocument_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "InsurancePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDocument" ADD CONSTRAINT "AssetDocument_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
