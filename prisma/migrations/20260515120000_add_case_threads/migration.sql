-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('MAINTENANCE', 'LEASE_RENEWAL', 'ARREARS', 'COMPLIANCE', 'GENERAL');
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'AWAITING_APPROVAL', 'AWAITING_VENDOR', 'AWAITING_TENANT', 'RESOLVED', 'CLOSED');
CREATE TYPE "CaseWaitingOn" AS ENUM ('MANAGER', 'OWNER', 'TENANT', 'VENDOR', 'NONE');
CREATE TYPE "CaseEventKind" AS ENUM ('COMMENT', 'STATUS_CHANGE', 'STAGE_CHANGE', 'ASSIGNMENT', 'EMAIL_SENT', 'DOCUMENT_ADDED', 'VENDOR_ASSIGNED', 'APPROVAL_REQUESTED', 'APPROVAL_GRANTED', 'APPROVAL_REJECTED', 'EXTERNAL_UPDATE');

-- CreateTable
CREATE TABLE "CaseThread" (
  "id" TEXT NOT NULL,
  "caseType" "CaseType" NOT NULL,
  "subjectId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "unitId" TEXT,
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
  "stage" TEXT,
  "stageStartedAt" TIMESTAMP(3),
  "assignedToUserId" TEXT,
  "waitingOn" "CaseWaitingOn" NOT NULL DEFAULT 'NONE',
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CaseThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseEvent" (
  "id" TEXT NOT NULL,
  "caseThreadId" TEXT NOT NULL,
  "kind" "CaseEventKind" NOT NULL,
  "actorUserId" TEXT,
  "actorEmail" TEXT,
  "actorName" TEXT,
  "body" TEXT,
  "meta" JSONB,
  "attachmentUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CaseEvent_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "MaintenanceJob" ADD COLUMN "caseThreadId" TEXT;

-- CreateIndex
CREATE INDEX "CaseThread_organizationId_status_idx" ON "CaseThread"("organizationId", "status");
CREATE INDEX "CaseThread_propertyId_status_idx" ON "CaseThread"("propertyId", "status");
CREATE INDEX "CaseThread_caseType_subjectId_idx" ON "CaseThread"("caseType", "subjectId");
CREATE INDEX "CaseThread_assignedToUserId_status_idx" ON "CaseThread"("assignedToUserId", "status");
CREATE INDEX "CaseThread_lastActivityAt_idx" ON "CaseThread"("lastActivityAt");
CREATE INDEX "CaseEvent_caseThreadId_createdAt_idx" ON "CaseEvent"("caseThreadId", "createdAt");
CREATE INDEX "MaintenanceJob_caseThreadId_idx" ON "MaintenanceJob"("caseThreadId");

-- AddForeignKey
ALTER TABLE "CaseThread" ADD CONSTRAINT "CaseThread_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseThread" ADD CONSTRAINT "CaseThread_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CaseThread" ADD CONSTRAINT "CaseThread_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseThread" ADD CONSTRAINT "CaseThread_assignedToUserId_fkey"
  FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CaseEvent" ADD CONSTRAINT "CaseEvent_caseThreadId_fkey"
  FOREIGN KEY ("caseThreadId") REFERENCES "CaseThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseEvent" ADD CONSTRAINT "CaseEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MaintenanceJob" ADD CONSTRAINT "MaintenanceJob_caseThreadId_fkey"
  FOREIGN KEY ("caseThreadId") REFERENCES "CaseThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;
