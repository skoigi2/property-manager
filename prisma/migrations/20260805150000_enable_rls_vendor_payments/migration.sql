-- Supabase security lint (rls_disabled_in_public): the two tables added by
-- 20260802091500_vendor_payments missed the project-wide RLS convention
-- established in 20260401000000_enable_rls_all_tables.
-- All data access goes through Prisma (postgres role) which bypasses RLS;
-- enabling RLS with no policies blocks direct PostgREST/anon API access.

ALTER TABLE "VendorPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VendorPaymentAllocation" ENABLE ROW LEVEL SECURITY;
