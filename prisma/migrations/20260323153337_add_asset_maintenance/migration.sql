-- CreateEnum
CREATE TYPE "MaintenanceFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'BIANNUALLY', 'ANNUALLY');

-- CreateTable
CREATE TABLE "AssetMaintenanceSchedule" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "taskName" TEXT NOT NULL,
    "description" TEXT,
    "frequency" "MaintenanceFrequency" NOT NULL,
    "lastDone" TIMESTAMP(3),
    "nextDue" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetMaintenanceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetMaintenanceLog" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "cost" DOUBLE PRECISION,
    "technician" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetMaintenanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetMaintenanceSchedule_assetId_idx" ON "AssetMaintenanceSchedule"("assetId");

-- CreateIndex
CREATE INDEX "AssetMaintenanceSchedule_nextDue_idx" ON "AssetMaintenanceSchedule"("nextDue");

-- CreateIndex
CREATE INDEX "AssetMaintenanceLog_assetId_idx" ON "AssetMaintenanceLog"("assetId");

-- CreateIndex
CREATE INDEX "AssetMaintenanceLog_scheduleId_idx" ON "AssetMaintenanceLog"("scheduleId");

-- AddForeignKey
ALTER TABLE "AssetMaintenanceSchedule" ADD CONSTRAINT "AssetMaintenanceSchedule_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetMaintenanceLog" ADD CONSTRAINT "AssetMaintenanceLog_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetMaintenanceLog" ADD CONSTRAINT "AssetMaintenanceLog_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AssetMaintenanceSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
