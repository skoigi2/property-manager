import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { sendNewUserAlert } from "@/lib/email";

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

  // Sequential operations — pgBouncer (transaction pooling mode) is incompatible
  // with the callback-form of prisma.$transaction, so we use individual awaits
  // with a best-effort rollback if any step fails.
  const org = await prisma.organization.create({
    data: { name: name.trim(), pricingTier: "TRIAL", trialEndsAt },
  });

  try {
    await prisma.user.update({
      where: { id: session!.user.id },
      data:  { organizationId: org.id },
    });
    await prisma.userOrganizationMembership.create({
      data: { userId: session!.user.id, organizationId: org.id, role: "ADMIN", isBillingOwner: true },
    });
  } catch (err) {
    // Best-effort rollback — delete the org so we don't leave orphaned data
    await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
    throw err;
  }

  sendNewUserAlert(
    session!.user.email as string,
    session!.user.name ?? "Unknown",
    name.trim(),
  ).catch(console.error);

  return NextResponse.json({ orgId: org.id }, { status: 201 });
}
