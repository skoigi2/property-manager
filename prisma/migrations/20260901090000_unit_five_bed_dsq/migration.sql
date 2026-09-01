-- Add FIVE_BED unit type + per-unit DSQ (Domestic Servant Quarter) flag.
-- FOUR_BED stops being the "4+" catch-all; FIVE_BED covers 5+ bedrooms.
ALTER TYPE "UnitType" ADD VALUE IF NOT EXISTS 'FIVE_BED';

ALTER TABLE "Unit" ADD COLUMN IF NOT EXISTS "hasDsq" BOOLEAN NOT NULL DEFAULT false;
