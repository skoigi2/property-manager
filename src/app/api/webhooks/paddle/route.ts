import { NextRequest, NextResponse } from "next/server";
import { verifyPaddleWebhook, tierFromPriceId } from "@/lib/paddle";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rawBody  = await req.text();
  const sigHeader = req.headers.get("paddle-signature");

  if (!sigHeader) {
    return NextResponse.json({ error: "Missing Paddle-Signature header." }, { status: 400 });
  }

  if (!verifyPaddleWebhook(rawBody, sigHeader)) {
    console.error("[paddle-webhook] signature verification failed");
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let event: PaddleEvent;
  try {
    event = JSON.parse(rawBody) as PaddleEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    await handleEvent(event);
  } catch (err) {
    console.error("[paddle-webhook] handler error:", err);
    return NextResponse.json({ error: "Handler error." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ── Minimal Paddle event types ─────────────────────────────────────────────

interface PaddleSubscription {
  id: string;
  status: string;                      // "active" | "past_due" | "canceled" | "trialing"
  customer_id: string;
  items: Array<{ price: { id: string } }>;
  current_billing_period?: { ends_at: string };
  custom_data?: Record<string, string>;
}

interface PaddleEvent {
  event_id: string;
  event_type: string;
  data: PaddleSubscription;
}

// ── Event handler ──────────────────────────────────────────────────────────

async function handleEvent(event: PaddleEvent) {
  const { event_id, event_type, data } = event;

  // Top-level idempotency check across ALL event types — prevents duplicate
  // processing if Paddle redelivers the same event for any reason.
  const alreadyProcessed = await prisma.organization.findFirst({
    where: { paddleEventId: event_id },
    select: { id: true },
  });
  if (alreadyProcessed) {
    console.info(`[paddle-webhook] event ${event_id} already processed; skipping`);
    return;
  }

  switch (event_type) {

    // ── Subscription created: first payment succeeded ──────────────────────
    case "subscription.created": {
      const orgId = data.custom_data?.organizationId;
      if (!orgId) break;

      const priceId = data.items[0]?.price.id ?? "";
      const tier    = tierFromPriceId(priceId) ?? "STARTER";
      const periodEnd = data.current_billing_period?.ends_at
        ? new Date(data.current_billing_period.ends_at)
        : null;

      await prisma.organization.update({
        where: { id: orgId },
        data: {
          pricingTier:          tier as "STARTER" | "GROWTH" | "PRO",
          subscriptionStatus:   data.status,
          paddleCustomerId:     data.customer_id,
          paddleSubscriptionId: data.id,
          paddleEventId:        event_id,
          currentPeriodEnd:     periodEnd,
          trialEndsAt:          null,
        },
      });

      console.info(`[paddle-webhook] org ${orgId} subscribed → ${tier}`);
      break;
    }

    // ── Subscription updated: renewal, plan change, or payment recovery ────
    case "subscription.updated": {
      const sub = await prisma.organization.findFirst({
        where: { paddleSubscriptionId: data.id },
        select: { id: true },
      });
      if (!sub) break;

      const priceId   = data.items[0]?.price.id ?? "";
      const tier      = tierFromPriceId(priceId);
      const periodEnd = data.current_billing_period?.ends_at
        ? new Date(data.current_billing_period.ends_at)
        : undefined;

      await prisma.organization.update({
        where: { id: sub.id },
        data: {
          ...(tier ? { pricingTier: tier as "STARTER" | "GROWTH" | "PRO" } : {}),
          subscriptionStatus: data.status,
          paddleEventId:      event_id,
          ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
        },
      });

      console.info(`[paddle-webhook] subscription ${data.id} updated → ${data.status}`);
      break;
    }

    // ── Subscription cancelled: end of term ───────────────────────────────
    case "subscription.canceled": {
      await prisma.organization.updateMany({
        where: { paddleSubscriptionId: data.id },
        data:  { subscriptionStatus: "canceled", paddleEventId: event_id },
      });

      console.info(`[paddle-webhook] subscription ${data.id} canceled`);
      break;
    }

    default:
      break;
  }
}
