-- Rent escalation: lease terms, scheduled rent changes, notice period.
CREATE TYPE "EscalationType" AS ENUM ('PERCENT', 'FIXED_AMOUNT');

ALTER TABLE "Tenant" ADD COLUMN "escalationType" "EscalationType" NOT NULL DEFAULT 'PERCENT';
ALTER TABLE "Tenant" ADD COLUMN "escalationAmount" DECIMAL(14,2);
ALTER TABLE "Tenant" ADD COLUMN "escalationAnchorDate" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN "escalationNoticeDays" INTEGER;

ALTER TABLE "ManagementAgreement" ADD COLUMN "rentIncreaseNoticeDays" INTEGER NOT NULL DEFAULT 90;

-- appliedAt NULL = scheduled (applied by the cron on the effective date).
-- Existing rows are history that already took effect: stamp their createdAt.
ALTER TABLE "RentHistory" ADD COLUMN "appliedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
UPDATE "RentHistory" SET "appliedAt" = "createdAt";
ALTER TABLE "RentHistory" ADD COLUMN "noticeSentAt" TIMESTAMP(3);
ALTER TABLE "RentHistory" ADD COLUMN "isEscalation" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RentHistory" ADD COLUMN "createdByName" TEXT;
CREATE INDEX "RentHistory_appliedAt_effectiveDate_idx" ON "RentHistory"("appliedAt", "effectiveDate");
