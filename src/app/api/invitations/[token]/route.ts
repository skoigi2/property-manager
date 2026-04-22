import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-utils";

/**
 * GET /api/invitations/[token]
 * Public route — returns invitation details for the accept page.
 * Returns 404 if not found, 410 if expired or already accepted.
 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const invitation = await prisma.orgInvitation.findUnique({
    where: { token: params.token },
    include: {
      organization: { select: { name: true } },
      invitedBy:    { select: { name: true, email: true } },
    },
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

  return Response.json({
    email:        invitation.email,
    role:         invitation.role,
    orgName:      invitation.organization.name,
    inviterName:  invitation.invitedBy.name ?? invitation.invitedBy.email,
    expiresAt:    invitation.expiresAt,
  });
}

/**
 * DELETE /api/invitations/[token]
 * Revoke a pending invitation (admin only, same org).
 */
export async function DELETE(_req: Request, { params }: { params: { token: string } }) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const invitation = await prisma.orgInvitation.findUnique({ where: { token: params.token } });
  if (!invitation) return Response.json({ error: "Invitation not found." }, { status: 404 });

  const isSuperAdmin = session!.user.role === "ADMIN" && !session!.user.organizationId;
  if (!isSuperAdmin && invitation.organizationId !== session!.user.organizationId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (invitation.acceptedAt) {
    return Response.json({ error: "Cannot revoke an accepted invitation." }, { status: 409 });
  }

  await prisma.orgInvitation.delete({ where: { token: params.token } });
  return new Response(null, { status: 204 });
}
