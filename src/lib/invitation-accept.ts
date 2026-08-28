import { prisma } from "@/lib/prisma";
import { canAddUser } from "@/lib/subscription";

// Shared invitation-acceptance logic, used by both acceptance paths:
// POST /api/invitations/[token]/accept (existing logged-in user) and
// POST /api/auth/signup with an inviteToken (brand-new invitee).

export type InvitationProblem = "accepted" | "expired" | null;

/** Why an invitation can no longer be accepted, or null when it's live. */
export function invitationProblem(
  inv: { acceptedAt: Date | null; expiresAt: Date },
  now: Date = new Date(),
): InvitationProblem {
  if (inv.acceptedAt) return "accepted";
  if (inv.expiresAt < now) return "expired";
  return null;
}

/**
 * Team-member cap re-check at acceptance time (an invite created under the
 * limit can be accepted after the org fills up). Returns a 402 Response to
 * short-circuit with, or null when the acceptance may proceed. A user who
 * ALREADY holds a membership in the org is never blocked — re-accepting must
 * not strand existing members.
 */
export async function assertTeamCapacityForInvite(
  organizationId: string,
  userId?: string,
): Promise<Response | null> {
  if (userId) {
    const existing = await prisma.userOrganizationMembership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { userId: true },
    });
    if (existing) return null;
  }
  const ok = await canAddUser(organizationId);
  if (ok) return null;
  return Response.json(
    { error: "This organisation has reached its team-member limit. Ask the admin to upgrade the plan.", code: "TEAM_LIMIT_REACHED" },
    { status: 402 },
  );
}

/**
 * Apply an accepted invitation: upsert the org membership with the invited
 * role (never billing owner), switch the user's active org, grant
 * PropertyAccess to all org properties for MANAGER/ACCOUNTANT, and stamp
 * acceptedAt. Sequential awaits by design — callback-form $transaction is
 * pgBouncer-incompatible. Never touches global User.role (that field exists
 * only for super-admin detection).
 */
export async function applyInvitationAcceptance(opts: {
  userId: string;
  invitation: { token: string; organizationId: string; role: string };
}): Promise<{ organizationId: string; orgRole: string; isBillingOwner: false; membershipCount: number }> {
  const { userId, invitation } = opts;
  const orgId = invitation.organizationId;
  const role = invitation.role as "ADMIN" | "MANAGER" | "ACCOUNTANT" | "OWNER";

  await prisma.userOrganizationMembership.upsert({
    where:  { userId_organizationId: { userId, organizationId: orgId } },
    create: { userId, organizationId: orgId, role, isBillingOwner: false },
    update: { role },
  });

  await prisma.user.update({
    where: { id: userId },
    data:  { organizationId: orgId },
  });

  // ADMIN sees all properties automatically; OWNER is scoped to ownedProperties.
  if (role === "MANAGER" || role === "ACCOUNTANT") {
    const orgProperties = await prisma.property.findMany({
      where:  { organizationId: orgId },
      select: { id: true },
    });
    if (orgProperties.length > 0) {
      await prisma.propertyAccess.createMany({
        data: orgProperties.map((p) => ({ userId, propertyId: p.id })),
        skipDuplicates: true,
      });
    }
  }

  await prisma.orgInvitation.update({
    where: { token: invitation.token },
    data:  { acceptedAt: new Date() },
  });

  const membershipCount = await prisma.userOrganizationMembership.count({ where: { userId } });

  return { organizationId: orgId, orgRole: role, isBillingOwner: false, membershipCount };
}
