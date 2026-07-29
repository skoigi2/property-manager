-- CalendarEventSnooze: per-user "not now" on a calendar event.
-- Keyed on the stable CalendarEvent id ("{TYPE}-{refId}"), not a FK, because
-- events are derived from several tables rather than stored in one.

-- CreateTable
CREATE TABLE IF NOT EXISTS "CalendarEventSnooze" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "until" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalendarEventSnooze_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "CalendarEventSnooze_userId_eventId_key" ON "CalendarEventSnooze"("userId","eventId");
CREATE INDEX IF NOT EXISTS "CalendarEventSnooze_userId_idx" ON "CalendarEventSnooze"("userId");

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "CalendarEventSnooze" ADD CONSTRAINT "CalendarEventSnooze_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Enable RLS (no policies — matches every other table in this schema)
ALTER TABLE "CalendarEventSnooze" ENABLE ROW LEVEL SECURITY;
