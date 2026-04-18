import { PricingTier } from "@prisma/client";

// ── Price ID → tier mapping ────────────────────────────────────────────────
// Populate these in your environment variables after creating prices in Paddle dashboard.
// Example env vars (add to Vercel + .env.local):
//   PADDLE_PRICE_STARTER_MONTHLY, PADDLE_PRICE_STARTER_ANNUAL
//   PADDLE_PRICE_GROWTH_MONTHLY,  PADDLE_PRICE_GROWTH_ANNUAL
//   PADDLE_PRICE_PRO_MONTHLY,     PADDLE_PRICE_PRO_ANNUAL

const PRICE_TIER_MAP: Record<string, PricingTier> = {};

function registerPrice(envKey: string, tier: PricingTier) {
  const id = process.env[envKey];
  if (id) PRICE_TIER_MAP[id] = tier;
}

registerPrice("PADDLE_PRICE_STARTER_MONTHLY", "STARTER");
registerPrice("PADDLE_PRICE_STARTER_ANNUAL",  "STARTER");
registerPrice("PADDLE_PRICE_GROWTH_MONTHLY",  "GROWTH");
registerPrice("PADDLE_PRICE_GROWTH_ANNUAL",   "GROWTH");
registerPrice("PADDLE_PRICE_PRO_MONTHLY",     "PRO");
registerPrice("PADDLE_PRICE_PRO_ANNUAL",      "PRO");

export function tierFromPriceId(priceId: string): PricingTier | null {
  return PRICE_TIER_MAP[priceId] ?? null;
}

// ── Webhook signature verification ────────────────────────────────────────
// Paddle signs webhooks with HMAC-SHA256.
// Header format: "ts=<timestamp>;h1=<hex-hash>"
// Signed payload: "<timestamp>:<rawBody>"

import { createHmac, timingSafeEqual } from "crypto";

export function verifyPaddleWebhook(rawBody: string, signatureHeader: string): boolean {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[paddle] PADDLE_WEBHOOK_SECRET is not set");
    return false;
  }

  // Parse ts and h1 from header
  const parts = Object.fromEntries(
    signatureHeader.split(";").map((p) => p.split("=") as [string, string])
  );
  const ts = parts["ts"];
  const h1 = parts["h1"];
  if (!ts || !h1) return false;

  const payload = `${ts}:${rawBody}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(h1, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

// ── Property limits per tier (single source of truth) ─────────────────────

export const PROPERTY_LIMITS: Record<string, number> = {
  TRIAL:   2,
  STARTER: 2,
  GROWTH:  10,
  PRO:     Infinity,
};

// ── Price IDs for client-side checkout ────────────────────────────────────
// These are safe to expose — they're public price identifiers.
export const PRICE_IDS = {
  starter: {
    monthly: process.env.PADDLE_PRICE_STARTER_MONTHLY ?? "",
    annual:  process.env.PADDLE_PRICE_STARTER_ANNUAL  ?? "",
  },
  growth: {
    monthly: process.env.PADDLE_PRICE_GROWTH_MONTHLY ?? "",
    annual:  process.env.PADDLE_PRICE_GROWTH_ANNUAL  ?? "",
  },
  pro: {
    monthly: process.env.PADDLE_PRICE_PRO_MONTHLY ?? "",
    annual:  process.env.PADDLE_PRICE_PRO_ANNUAL  ?? "",
  },
} as const;
