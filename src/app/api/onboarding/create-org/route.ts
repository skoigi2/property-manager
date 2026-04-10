import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/onboarding/create-org
 *
 * Called by the onboarding wizard when a new Google OAuth user (who has no
 * organisation yet) completes the org-name field on Step 1.
 *
 * - Creates the Organisation with a 30-day TRIAL
 * - Creates the UserOrganizationMembership record
 * - Updates User.organizationId so subsequent queries scope correctly
 *
 * The client must call session.update({ organizationId, membershipCount: 1 })
 * afterwards to refresh the JWT without a full re-login.
 */
export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  // Only allowed when the user has no org yet
  if (session!.user.organizationId) {
    return NextResponse.json({ error: "Organisation already exists." }, { status: 409 });
  }

  const { name } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Organisation name is required." }, { status: 400 });
  }

  const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const { org } = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name:        name.trim(),
        pricingTier: "TRIAL",
        trialEndsAt,
      },
    });

    await tx.user.update({
      where: { id: session!.user.id },
      data:  { organizationId: org.id },
    });

    await tx.userOrganizationMembership.create({
      data: { userId: session!.user.id, organizationId: org.id },
    });

    return { org };
  });

  return NextResponse.json({ orgId: org.id }, { status: 201 });
}
