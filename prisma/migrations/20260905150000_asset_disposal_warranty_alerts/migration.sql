-- Assets: disposal (retire without deleting history) + warranty-expiry alerts.
-- ALTER TYPE ... ADD VALUE first and never referenced later in this script
-- (Postgres forbids using a new enum label in the same transaction).
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WARRANTY_EXPIRY_30D';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WARRANTY_EXPIRY_7D';
ALTER TYPE "HintType" ADD VALUE IF NOT EXISTS 'WARRANTY_EXPIRY_30D';
ALTER TYPE "HintType" ADD VALUE IF NOT EXISTS 'WARRANTY_EXPIRY_7D';

ALTER TABLE "Asset"
  ADD COLUMN IF NOT EXISTS "disposedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "disposalNotes" TEXT;
