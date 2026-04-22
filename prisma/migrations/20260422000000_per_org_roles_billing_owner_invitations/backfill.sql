-- ─── BACKFILL: Run immediately after schema push ────────────────────────────
-- Run this in the Supabase SQL Editor (production) or via psql (DIRECT_URL).
-- It is safe to run while the app is live — only updates rows with default values.

-- Step 1: Copy each user's global role into their membership rows
UPDATE "UserOrganizationMembership" m
SET "role" = u."role"
FROM "User" u
WHERE m."userId" = u."id";

-- Step 2: Mark the earliest ADMIN (or earliest member) of each org as billing owner
WITH ranked AS (
  SELECT
    m."id",
    ROW_NUMBER() OVER (
      PARTITION BY m."organizationId"
      ORDER BY
        CASE WHEN m."role" = 'ADMIN' THEN 0 ELSE 1 END,
        m."createdAt" ASC
    ) AS rn
  FROM "UserOrganizationMembership" m
)
UPDATE "UserOrganizationMembership"
SET "isBillingOwner" = true
FROM ranked
WHERE ranked."id" = "UserOrganizationMembership"."id"
  AND ranked."rn" = 1;
