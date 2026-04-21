ALTER TABLE "AuditLog" ADD COLUMN "organizationId" TEXT;
CREATE INDEX "AuditLog_organizationId_idx" ON "AuditLog"("organizationId");
