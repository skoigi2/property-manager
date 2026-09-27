-- Supabase security lint (rls_disabled_in_public): the tables added by
-- 20260904120000_tenant_complaints and 20260918090000_utility_metering missed
-- the project-wide RLS convention established in
-- 20260401000000_enable_rls_all_tables.
-- All data access goes through Prisma (postgres role) which bypasses RLS;
-- enabling RLS with no policies blocks direct PostgREST/anon API access.
-- Guarded from recurring by src/lib/__tests__/migrations-rls.test.ts.

ALTER TABLE "TenantComplaint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UtilitySetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UtilityTariff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UtilityMeter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MeterReading" ENABLE ROW LEVEL SECURITY;

-- 20260612090000_add_api_keys_webhooks never recorded RLS for its two tables.
-- Production already has it on (enabled by hand); this makes a database built
-- from the migrations match. Re-enabling is a no-op.
ALTER TABLE "ApiKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookEndpoint" ENABLE ROW LEVEL SECURITY;
