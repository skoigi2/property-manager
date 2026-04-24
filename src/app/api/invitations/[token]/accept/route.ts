import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/invitations/[token]/accept
 *
 * The invitee must be logged in. Their session email must match the invitation.
 * Creates (or upserts) the org membership with the invited role.
 */
export async function POST(_req: Request, { params }: { params: { token: string } }) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const invitation = await prisma.orgInvitation.findUnique({
    where: { token: params.token },
  });

  if (!invitation) {
    return Response.json({ error: "Invitation not found." }, { status: 404 });
  }
  if (invitation.acceptedAt) {
    return Response.json({ error: "This invitation has already been accepted." }, { status: 410 });
  }
  if (invitation.expiresAt < new Date()) {
    return Response.json({ error: "This invitation has expired." }, { status: 410 });
  }

  // Security: logged-in user must match the invited email
  if (session!.user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
    return Response.json(
      { error: "This invitation was sent to a different email address." },
      { status: 403 }
    );
  }

  const userId = session!.user.id;
  const orgId  = invitation.organizationId;
  const role   = invitation.role;

  // Upsert membership with the invited role; never make them billing owner
  await prisma.userOrganizationMembership.upsert({
    where:  { userId_organizationId: { userId, organizationId: orgId } },
    create: { userId, organizationId: orgId, role, isBillingOwner: false },
    update: { role },
  });

  // Switch active org — never overwrite global User.role (it's only for super-admin detection)
  await prisma.user.update({
    where: { id: userId },
    data:  { organizationId: orgId },
  });

  // Grant PropertyAccess to all org properties for MANAGER / ACCOUNTANT roles.
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

  // Mark accepted
  await prisma.orgInvitation.update({
    where: { token: params.token },
    data:  { acceptedAt: new Date() },
  });

  const membershipCount = await prisma.userOrganizationMembership.count({
    where: { userId },
  });

  return Response.json({
    ok: true,
    organizationId: orgId,
    orgRole:        invitation.role,
    isBillingOwner: false,
    membershipCount,
  });
}
