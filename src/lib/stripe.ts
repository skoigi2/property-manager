import Stripe from "stripe";

// ─── Lazy Stripe singleton ────────────────────────────────────────────────────
// Initialized on first use so builds succeed even when STRIPE_SECRET_KEY is absent.

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return _stripe;
}

/** Convenience re-export so callers can use `stripe.xxx` directly */
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getStripe() as any)[prop];
  },
});

// ─── Price IDs (set in Vercel env vars) ──────────────────────────────────────

export const PRICE_IDS = {
  STARTER: {
    monthly: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID!,
    annual:  process.env.STRIPE_STARTER_ANNUAL_PRICE_ID!,
  },
  GROWTH: {
    monthly: process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID!,
    annual:  process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID!,
  },
  PRO: {
    monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID!,
    annual:  process.env.STRIPE_PRO_ANNUAL_PRICE_ID!,
  },
} as const;

// ─── Property limits per tier (single source of truth) ───────────────────────
// Never store this in the DB — compute at runtime from pricingTier.

export const PROPERTY_LIMITS: Record<string, number> = {
  TRIAL:   2,
  STARTER: 2,
  GROWTH:  10,
  PRO:     Infinity,
};

// ─── Tier lookup from Stripe Price ID ────────────────────────────────────────
// Used in webhook handler to map a Stripe price back to our tier.

export function tierFromPriceId(priceId: string): string | null {
  for (const [tier, prices] of Object.entries(PRICE_IDS)) {
    if (prices.monthly === priceId || prices.annual === priceId) return tier;
  }
  return null;
}
