-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM (
  'LEASE_EXPIRY_30D',
  'LEASE_EXPIRY_7D',
  'INVOICE_OVERDUE',
  'COMPLIANCE_EXPIRY_30D',
  'COMPLIANCE_EXPIRY_7D',
  'INSURANCE_EXPIRY_30D',
  'INSURANCE_EXPIRY_7D',
  'MAINTENANCE_URGENT_OPEN'
);

-- CreateTable
CREATE TABLE "NotificationLog" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "type"           "NotificationType" NOT NULL,
  "resourceId"     TEXT NOT NULL,
  "resourceType"   TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "subject"        TEXT NOT NULL,
  "sentAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "NotificationLog"
  ADD CONSTRAINT "NotificationLog_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "NotificationLog_type_resourceId_sentAt_idx"
  ON "NotificationLog"("type", "resourceId", "sentAt");

-- CreateIndex
CREATE INDEX "NotificationLog_organizationId_sentAt_idx"
  ON "NotificationLog"("organizationId", "sentAt");
