import { prisma } from "@/lib/prisma";
import { canAddUser } from "@/lib/subscription";
import { sendTeamWelcome } from "@/lib/email";

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
  role?: string | null,
): Promise<Response | null> {
  if (userId) {
    const existing = await prisma.userOrganizationMembership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { userId: true },
    });
    if (existing) return null;
  }
  const ok = await canAddUser(organizationId, role);
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
  invitation: { token: string; organizationId: string; role: string; propertyIds?: string[] };
}): Promise<{ organizationId: string; orgRole: string; isBillingOwner: false; membershipCount: number }> {
  const { userId, invitation } = opts;
  const orgId = invitation.organizationId;
  const role = invitation.role as "ADMIN" | "MANAGER" | "ACCOUNTANT" | "OWNER" | "CARETAKER";

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
  // A non-empty invitation.propertyIds limits the grant to that scope; empty
  // means all org properties (legacy invitations carry no scope) — except for
  // CARETAKER, whose invitation always carries an explicit scope (POST
  // /api/invitations refuses an empty one) and must never default to all.
  const scopedRole = role === "MANAGER" || role === "ACCOUNTANT"
    || (role === "CARETAKER" && (invitation.propertyIds?.length ?? 0) > 0);
  if (scopedRole) {
    const scoped = invitation.propertyIds ?? [];
    const orgProperties = await prisma.property.findMany({
      where: {
        organizationId: orgId,
        ...(scoped.length > 0 ? { id: { in: scoped } } : {}),
      },
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

/**
 * Sign-in hook. A user who holds NO org membership yet but has a live
 * invitation to an existing org is joined to it here, so they never reach the
 * "create your organisation" onboarding step (the screen an invitee must not
 * see). Runs on every Google and credentials sign-in.
 *
 * Deliberately skipped for:
 * - users who already belong to an org — they accept explicitly from
 *   /invite/[token] so their active org never flips under them;
 * - super-admin-shaped accounts (global ADMIN, no org).
 *
 * Mirrors the invited-signup path: the global User.role is set from the
 * invitation because this user has no other org. Never throws — a failure
 * here must not block sign-in. Returns the joined org id, or null.
 */
export async function autoAcceptPendingInvitations(user: {
  id: string;
  email: string | null;
  name?: string | null;
  role: string;
  organizationId: string | null;
}): Promise<string | null> {
  if (!user.email) return null;
  if (user.role === "ADMIN" && !user.organizationId) return null;
  try {
    const memberships = await prisma.userOrganizationMembership.count({ where: { userId: user.id } });
    if (memberships > 0) return null;

    const pending = await prisma.orgInvitation.findMany({
      where: {
        email:      user.email.toLowerCase(),
        status:     "SENT",
        acceptedAt: null,
        expiresAt:  { gt: new Date() },
      },
      orderBy: { createdAt: "asc" },
      include: {
        organization: { select: { name: true } },
        invitedBy:    { select: { name: true, email: true } },
      },
    });
    if (pending.length === 0) return null;

    let joined: string | null = null;
    for (const invitation of pending) {
      // Org filled up since the invite was sent — leave it pending; the
      // onboarding page surfaces the limit when they try to accept.
      if (!(await canAddUser(invitation.organizationId))) continue;
      await applyInvitationAcceptance({ userId: user.id, invitation });
      if (!joined) {
        joined = invitation.organizationId;
        await prisma.user.update({ where: { id: user.id }, data: { role: invitation.role } });
      }
      // Welcome them to the organisation (never the founder/trial email).
      sendTeamWelcome({
        email:          user.email,
        name:           user.name ?? "there",
        orgName:        invitation.organization.name,
        role:           invitation.role,
        inviterName:    invitation.invitedBy.name ?? invitation.invitedBy.email,
        userId:         user.id,
        organizationId: invitation.organizationId,
      }).catch(console.error);
    }
    return joined;
  } catch (err) {
    console.error("[autoAcceptPendingInvitations]", err);
    return null;
  }
}
