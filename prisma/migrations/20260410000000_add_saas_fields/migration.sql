-- Migration: add_saas_fields
-- Adds PricingTier enum, subscription fields on Organization,
-- and password reset fields on User.

-- 1. New enum
CREATE TYPE "PricingTier" AS ENUM ('TRIAL', 'STARTER', 'GROWTH', 'PRO');

-- 2. Organization billing fields
ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "pricingTier"          "PricingTier" NOT NULL DEFAULT 'TRIAL',
  ADD COLUMN IF NOT EXISTS "trialEndsAt"          TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "subscriptionStatus"   TEXT,
  ADD COLUMN IF NOT EXISTS "stripeCustomerId"     TEXT,
  ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT,
  ADD COLUMN IF NOT EXISTS "stripeEventId"        TEXT;

-- 3. User password reset fields
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "passwordResetToken"   TEXT,
  ADD COLUMN IF NOT EXISTS "passwordResetExpires" TIMESTAMP(3);

-- 4. Unique constraint on reset token
CREATE UNIQUE INDEX IF NOT EXISTS "User_passwordResetToken_key"
  ON "User"("passwordResetToken");
