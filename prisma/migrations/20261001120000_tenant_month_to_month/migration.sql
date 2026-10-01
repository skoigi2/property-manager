-- Tenant on a rolling month-to-month basis after the lease ended (manager
-- decision). Silences the "lease expired" Inbox item; reset when leaseEnd changes.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "monthToMonth" BOOLEAN NOT NULL DEFAULT false;
