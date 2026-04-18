-- Replace Stripe billing fields with Paddle equivalents
ALTER TABLE "Organization" RENAME COLUMN "stripeCustomerId" TO "paddleCustomerId";
ALTER TABLE "Organization" RENAME COLUMN "stripeSubscriptionId" TO "paddleSubscriptionId";
ALTER TABLE "Organization" RENAME COLUMN "stripeEventId" TO "paddleEventId";

-- Add current period end for subscription expiry tracking
ALTER TABLE "Organization" ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);
