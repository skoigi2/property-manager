-- CalendarFeedToken: subscribe-by-URL token for the read-only calendar ICS feed.
-- No expiry column by design — access ends explicitly via revokedAt.

-- CreateTable
CREATE TABLE IF NOT EXISTS "CalendarFeedToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "propertyIds" TEXT[],
  "label" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAccessedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "CalendarFeedToken_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "CalendarFeedToken_token_key" ON "CalendarFeedToken"("token");
CREATE INDEX IF NOT EXISTS "CalendarFeedToken_userId_idx" ON "CalendarFeedToken"("userId");
CREATE INDEX IF NOT EXISTS "CalendarFeedToken_token_idx" ON "CalendarFeedToken"("token");

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "CalendarFeedToken" ADD CONSTRAINT "CalendarFeedToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Enable RLS
-- No policies, matching every other table in this schema: the anon and
-- authenticated Supabase keys get no access at all, while Prisma (connecting as
-- the table owner) is unaffected. This table holds feed tokens, so a stray anon
-- key must never be able to read it.
ALTER TABLE "CalendarFeedToken" ENABLE ROW LEVEL SECURITY;
