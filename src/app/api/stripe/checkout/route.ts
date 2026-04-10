import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-utils";
import { stripe, PRICE_IDS } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const orgId = session!.user.organizationId;
  if (!orgId) {
    return NextResponse.json({ error: "No organisation found." }, { status: 400 });
  }

  const { plan, billing } = await req.json();
  const planKey = (plan as string)?.toUpperCase() as keyof typeof PRICE_IDS;
  const billingKey = billing === "annual" ? "annual" : "monthly";

  if (!PRICE_IDS[planKey]) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }

  const priceId = PRICE_IDS[planKey][billingKey];
  if (!priceId) {
    return NextResponse.json({ error: "Price not configured." }, { status: 400 });
  }

  // Get org to check for existing Stripe customer
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { stripeCustomerId: true, name: true },
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://property-manager-ke-rho.vercel.app";

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...(org?.stripeCustomerId
      ? { customer: org.stripeCustomerId }
      : { customer_email: session!.user.email ?? undefined }),
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { organizationId: orgId },
    },
    metadata: { organizationId: orgId },
    success_url: `${baseUrl}/billing?success=true`,
    cancel_url:  `${baseUrl}/billing`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
