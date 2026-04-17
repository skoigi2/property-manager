-- CreateEnum
CREATE TYPE "PettyCashStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "PettyCash"
  ADD COLUMN "status"          "PettyCashStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "receiptRef"      TEXT,
  ADD COLUMN "approvedBy"      TEXT,
  ADD COLUMN "approvedAt"      TIMESTAMP(3),
  ADD COLUMN "approvalNotes"   TEXT,
  ADD COLUMN "rejectedAt"      TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT;

-- CreateIndex
CREATE INDEX "PettyCash_status_idx" ON "PettyCash"("status");
