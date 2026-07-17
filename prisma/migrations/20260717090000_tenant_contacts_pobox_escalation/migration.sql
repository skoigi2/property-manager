-- Tenant feedback batch: multiple contacts, postal address for letters, and
-- a configurable escalation interval (annual / every N years).

ALTER TABLE "Tenant" ADD COLUMN "additionalContacts" JSONB;
ALTER TABLE "Tenant" ADD COLUMN "poBox" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "escalationIntervalYears" INTEGER;
