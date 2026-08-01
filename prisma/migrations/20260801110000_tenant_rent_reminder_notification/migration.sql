-- Dunning automation: tenant-facing rent reminder notifications logged in
-- NotificationLog (dedup per invoice+stage via composite resourceId).
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TENANT_RENT_REMINDER';
