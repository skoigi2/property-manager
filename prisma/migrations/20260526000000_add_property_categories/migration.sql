-- Add three new PropertyCategory enum values: LAND, GROUND_LEASE, COMMERCIAL_SPECIAL_USE.
-- Postgres does not allow adding multiple enum values in a single ALTER TYPE inside a
-- transaction in some versions, so each ADD VALUE is run separately.

ALTER TYPE "PropertyCategory" ADD VALUE IF NOT EXISTS 'LAND';
ALTER TYPE "PropertyCategory" ADD VALUE IF NOT EXISTS 'GROUND_LEASE';
ALTER TYPE "PropertyCategory" ADD VALUE IF NOT EXISTS 'COMMERCIAL_SPECIAL_USE';
