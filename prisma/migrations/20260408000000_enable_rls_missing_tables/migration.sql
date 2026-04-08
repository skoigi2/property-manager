-- Enable Row Level Security on tables added after the initial RLS migration.
-- All data access goes through Prisma (postgres role) which bypasses RLS.
-- This blocks direct PostgREST/anon API access to these tables.

ALTER TABLE "Vendor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComplianceCertificate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaxConfiguration" ENABLE ROW LEVEL SECURITY;
