-- CalendarFeedToken: subscribe-by-URL token for the read-only calendar ICS feed.
-- No expiry column by design — access ends explicitly via revokedAt.

CREATE TABLE "CalendarFeedToken" (
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

CREATE UNIQUE INDEX "CalendarFeedToken_token_key" ON "CalendarFeedToken"("token");
CREATE INDEX "CalendarFeedToken_userId_idx" ON "CalendarFeedToken"("userId");
CREATE INDEX "CalendarFeedToken_token_idx" ON "CalendarFeedToken"("token");

ALTER TABLE "CalendarFeedToken"
    ADD CONSTRAINT "CalendarFeedToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
