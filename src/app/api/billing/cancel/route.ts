import { NextResponse } from "next/server";
import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const { error, session } = await requireManager();
  if (error) return error;

  const orgId = session!.user.organizationId;
  if (!orgId) return NextResponse.json({ error: "No organisation found." }, { status: 400 });

  const org = await prisma.organization.findUnique({
    where:  { id: orgId },
    select: { paddleSubscriptionId: true },
  });

  if (!org?.paddleSubscriptionId) {
    return NextResponse.json({ error: "No active subscription found." }, { status: 404 });
  }

  const paddleApiKey = process.env.PADDLE_API_KEY;
  if (!paddleApiKey) {
    return NextResponse.json({ error: "Billing not configured." }, { status: 500 });
  }

  // Cancel at end of current billing period
  const res = await fetch(
    `https://api.paddle.com/subscriptions/${org.paddleSubscriptionId}`,
    {
      method:  "PATCH",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${paddleApiKey}`,
      },
      body: JSON.stringify({
        scheduled_change: { action: "cancel", effective_at: "next_billing_period" },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    console.error("[billing/cancel] Paddle API error:", body);
    return NextResponse.json({ error: "Failed to cancel subscription." }, { status: 502 });
  }

  await prisma.organization.update({
    where: { id: orgId },
    data:  { subscriptionStatus: "canceled" },
  });

  return NextResponse.json({ ok: true });
}
