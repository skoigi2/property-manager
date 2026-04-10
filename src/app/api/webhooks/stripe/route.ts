import { NextRequest, NextResponse } from "next/server";
import { stripe, tierFromPriceId } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

// Stripe requires the raw body to verify the signature
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body      = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  // ── Idempotency guard ──────────────────────────────────────────────────────
  // stripeEventId is @unique on Organization — if we've already processed this
  // event for any org, skip it.
  // For events without an orgId in metadata we fall through; duplicate delivery
  // is safe for subscription.updated/deleted because Prisma upsert is idempotent.

  try {
    await handleEvent(event);
  } catch (err) {
    console.error("[stripe-webhook] handler error:", err);
    return NextResponse.json({ error: "Handler error." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleEvent(event: Stripe.Event) {
  switch (event.type) {

    // ── Checkout session completed: user just paid ─────────────────────────
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId   = session.metadata?.organizationId;
      if (!orgId) break;

      // Guard against duplicate events
      const existing = await prisma.organization.findFirst({
        where: { stripeEventId: event.id },
        select: { id: true },
      });
      if (existing) break;

      // Retrieve the subscription to get the price ID
      const subscriptionId = session.subscription as string;
      const subscription   = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId        = subscription.items.data[0]?.price.id ?? "";
      const tier           = tierFromPriceId(priceId) ?? "STARTER";

      await prisma.organization.update({
        where: { id: orgId },
        data: {
          pricingTier:          tier as "STARTER" | "GROWTH" | "PRO",
          subscriptionStatus:   subscription.status,
          stripeCustomerId:     session.customer as string,
          stripeSubscriptionId: subscriptionId,
          stripeEventId:        event.id,
          // Clear the trial — they're now on a paid plan
          trialEndsAt:          null,
        },
      });

      console.info(`[stripe-webhook] org ${orgId} upgraded to ${tier}`);
      break;
    }

    // ── Subscription updated: plan change / renewal ────────────────────────
    case "customer.subscription.updated": {
      const sub   = event.data.object as Stripe.Subscription;
      const orgId = sub.metadata?.organizationId;
      if (!orgId) break;

      const priceId = sub.items.data[0]?.price.id ?? "";
      const tier    = tierFromPriceId(priceId);

      await prisma.organization.updateMany({
        where: { stripeSubscriptionId: sub.id },
        data: {
          ...(tier ? { pricingTier: tier as "STARTER" | "GROWTH" | "PRO" } : {}),
          subscriptionStatus: sub.status,
        },
      });

      console.info(`[stripe-webhook] subscription ${sub.id} updated → ${sub.status}`);
      break;
    }

    // ── Subscription deleted: user cancelled ───────────────────────────────
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;

      await prisma.organization.updateMany({
        where: { stripeSubscriptionId: sub.id },
        data:  { subscriptionStatus: "canceled" },
      });

      console.info(`[stripe-webhook] subscription ${sub.id} canceled`);
      break;
    }

    default:
      // Ignore other event types
      break;
  }
}
