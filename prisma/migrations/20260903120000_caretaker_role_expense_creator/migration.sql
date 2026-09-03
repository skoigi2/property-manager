-- CARETAKER: on-site staff role (expenses / maintenance / vendors only).
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CARETAKER';

-- Who entered an expense — drives "edit/delete own rows only" for CARETAKER.
-- NULL on legacy rows = not owned by anyone.
ALTER TABLE "ExpenseEntry" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
CREATE INDEX IF NOT EXISTS "ExpenseEntry_createdByUserId_idx" ON "ExpenseEntry"("createdByUserId");
ALTER TABLE "ExpenseEntry"
  ADD CONSTRAINT "ExpenseEntry_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Best-effort backfill from the audit trail (earliest CREATE per expense,
-- only where that user still exists). Legacy rows without a trail stay NULL.
UPDATE "ExpenseEntry" e
SET "createdByUserId" = a."userId"
FROM (
  SELECT DISTINCT ON ("resourceId") "resourceId", "userId"
  FROM "AuditLog"
  WHERE resource = 'ExpenseEntry' AND action = 'CREATE'
  ORDER BY "resourceId", "createdAt" ASC
) a
JOIN "User" u ON u.id = a."userId"
WHERE e.id = a."resourceId" AND e."createdByUserId" IS NULL;
