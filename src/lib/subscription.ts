import { prisma } from "@/lib/prisma";
import { PROPERTY_LIMITS } from "@/lib/paddle";

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
  freeAccess?:        boolean;
}): boolean {
  if (org.freeAccess) return true; // Complimentary PRO — always active
  if (org.pricingTier !== "TRIAL") {
    return org.subscriptionStatus === "active" || org.subscriptionStatus === "trialing";
  }
  return !isTrialExpired(org);
}

export function isLocked(org: {
  pricingTier:        string;
  subscriptionStatus: string | null;
  trialEndsAt:        Date | null;
  freeAccess?:        boolean;
}): boolean {
  if (org.freeAccess) return false; // Complimentary PRO — never locked
  if (org.pricingTier === "TRIAL") return isTrialExpired(org);
  return (
    org.subscriptionStatus === "canceled" ||
    org.subscriptionStatus === "expired"  ||
    org.subscriptionStatus === "past_due"  // payment failed — block writes until resolved
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
      select: { pricingTier: true, freeAccess: true },
    }),
    prisma.property.count({ where: { organizationId: orgId } }),
  ]);
  if (!org) return false;
  if (org.freeAccess) return true; // Complimentary PRO — no property limit
  const limit = PROPERTY_LIMITS[org.pricingTier] ?? 2;
  return count < limit;
}

// ─── Write-gate: call at the top of every POST/PATCH/DELETE handler ──────────

/**
 * Returns a 402 Response if the org's subscription is locked (trial expired,
 * past_due, or canceled). Returns null if the org may proceed.
 *
 * Usage:
 *   const locked = await requireActiveSubscription(orgId);
 *   if (locked) return locked;
 */
export async function requireActiveSubscription(
  orgId: string | null | undefined
): Promise<Response | null> {
  if (!orgId) return null; // super-admin has no org, never locked
  const org = await prisma.organization.findUnique({
    where:  { id: orgId },
    select: { pricingTier: true, subscriptionStatus: true, trialEndsAt: true, freeAccess: true },
  });
  if (!org) return Response.json({ error: "Organisation not found." }, { status: 404 });
  if (isLocked(org)) {
    return Response.json(
      {
        error: "Your subscription is inactive. Please upgrade to continue.",
        code:  "SUBSCRIPTION_LOCKED",
      },
      { status: 402 }
    );
  }
  return null;
}

// ─── Subscription info for billing page ──────────────────────────────────────

export async function getSubscriptionInfo(orgId: string) {
  const [org, propertyCount] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        pricingTier:          true,
        subscriptionStatus:   true,
        trialEndsAt:          true,
        currentPeriodEnd:     true,
        paddleCustomerId:     true,
        paddleSubscriptionId: true,
        freeAccess:           true,
      },
    }),
    prisma.property.count({ where: { organizationId: orgId } }),
  ]);
  if (!org) return null;

  const limit = org.freeAccess ? Infinity : (PROPERTY_LIMITS[org.pricingTier] ?? 2);

  return {
    pricingTier:        org.pricingTier,
    subscriptionStatus: org.subscriptionStatus,
    trialEndsAt:        org.trialEndsAt,
    currentPeriodEnd:   org.currentPeriodEnd,
    trialDaysLeft:      trialDaysLeft(org.trialEndsAt),
    isLocked:           isLocked(org),
    freeAccess:         org.freeAccess,
    propertyCount,
    propertyLimit:      limit === Infinity ? null : limit,
    hasSubscription:    !!org.paddleSubscriptionId,
  };
}
