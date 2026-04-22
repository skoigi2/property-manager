-- Enable Row Level Security on tables added after the initial RLS migration.
-- All data access goes through Prisma (postgres role) which bypasses RLS.
-- This blocks direct PostgREST/anon API access to these tables.

ALTER TABLE "NotificationLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommunicationLog" ENABLE ROW LEVEL SECURITY;
