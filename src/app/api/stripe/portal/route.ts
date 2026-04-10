import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-utils";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { error, session } = await requireAuth();
  if (error) return error;

  const orgId = session!.user.organizationId;
  if (!orgId) {
    return NextResponse.json({ error: "No organisation found." }, { status: 400 });
  }

  const org = await prisma.organization.findUnique({
    where:  { id: orgId },
    select: { stripeCustomerId: true },
  });

  if (!org?.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account found." }, { status: 404 });
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://groundworkpm.com";

  const portalSession = await stripe.billingPortal.sessions.create({
    customer:   org.stripeCustomerId,
    return_url: `${baseUrl}/billing`,
  });

  return NextResponse.json({ url: portalSession.url });
}
