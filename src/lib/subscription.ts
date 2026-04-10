import { prisma } from "@/lib/prisma";
import { PROPERTY_LIMITS } from "@/lib/stripe";

// ─── Trial & subscription status helpers ─────────────────────────────────────

export function isTrialExpired(org: {
  pricingTier: string;
  trialEndsAt: Date | null;
}): boolean {
  if (org.pricingTier !== "TRIAL") return false;
  if (!org.trialEndsAt) return false;
  return org.trialEndsAt < new Date();
}

export function isSubscriptionActive(org: {
  pricingTier:        string;
  subscriptionStatus: string | null;
  trialEndsAt:        Date | null;
}): boolean {
  // Paid tiers — trust Stripe status
  if (org.pricingTier !== "TRIAL") {
    return org.subscriptionStatus === "active" || org.subscriptionStatus === "trialing";
  }
  // Trial — active as long as not expired
  return !isTrialExpired(org);
}

export function isLocked(org: {
  pricingTier:        string;
  subscriptionStatus: string | null;
  trialEndsAt:        Date | null;
}): boolean {
  if (org.pricingTier === "TRIAL") return isTrialExpired(org);
  return (
    org.subscriptionStatus === "canceled" ||
    org.subscriptionStatus === "expired"
  );
}

export function trialDaysLeft(trialEndsAt: Date | null): number {
  if (!trialEndsAt) return 0;
  const diff = trialEndsAt.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ─── Property limit guard ─────────────────────────────────────────────────────

export async function canAddProperty(orgId: string): Promise<boolean> {
  const [org, count] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { pricingTier: true },
    }),
    prisma.property.count({ where: { organizationId: orgId } }),
  ]);
  if (!org) return false;
  const limit = PROPERTY_LIMITS[org.pricingTier] ?? 2;
  return count < limit;
}

// ─── Subscription info for billing page ──────────────────────────────────────

export async function getSubscriptionInfo(orgId: string) {
  const [org, propertyCount] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        pricingTier:        true,
        subscriptionStatus: true,
        trialEndsAt:        true,
        stripeCustomerId:   true,
        stripeSubscriptionId: true,
      },
    }),
    prisma.property.count({ where: { organizationId: orgId } }),
  ]);
  if (!org) return null;

  const limit = PROPERTY_LIMITS[org.pricingTier] ?? 2;

  return {
    pricingTier:        org.pricingTier,
    subscriptionStatus: org.subscriptionStatus,
    trialEndsAt:        org.trialEndsAt,
    trialDaysLeft:      trialDaysLeft(org.trialEndsAt),
    isLocked:           isLocked(org),
    propertyCount,
    propertyLimit:      limit === Infinity ? null : limit,
    hasStripeCustomer:  !!org.stripeCustomerId,
    hasSubscription:    !!org.stripeSubscriptionId,
  };
}
