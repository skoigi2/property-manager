import { prisma } from "@/lib/prisma";
import { requireAdmin, requireManager } from "@/lib/auth-utils";

/**
 * GET /api/invitations/[token]
 * Public route — returns invitation details for the accept page.
 * Returns 404 if not found, 410 if expired. An accepted invitation still
 * returns its details with `accepted: true` so the page can send a member who
 * re-follows the email link to the dashboard instead of an error.
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
  // A manager's request is inert until an admin approves it — don't reveal it
  if (invitation.status === "REQUESTED") {
    return Response.json({ error: "Invitation not found." }, { status: 404 });
  }
  if (!invitation.acceptedAt && invitation.expiresAt < new Date()) {
    return Response.json({ error: "This invitation has expired." }, { status: 410 });
  }

  return Response.json({
    accepted:     !!invitation.acceptedAt,
    email:        invitation.email,
    role:         invitation.role,
    orgName:      invitation.organization.name,
    inviterName:  invitation.invitedBy.name ?? invitation.invitedBy.email,
    expiresAt:    invitation.expiresAt,
  });
}

/**
 * DELETE /api/invitations/[token]
 * Revoke a pending invitation. Admins may revoke any in their org; a manager
 * may cancel a row they created themselves (e.g. withdraw their request).
 */
export async function DELETE(_req: Request, { params }: { params: { token: string } }) {
  const { error, session } = await requireManager();
  if (error) return error;

  const invitation = await prisma.orgInvitation.findUnique({ where: { token: params.token } });
  if (!invitation) return Response.json({ error: "Invitation not found." }, { status: 404 });

  const isSuperAdmin = session!.user.role === "ADMIN" && !session!.user.organizationId;
  const isOrgAdmin   = session!.user.orgRole === "ADMIN";
  if (!isSuperAdmin) {
    if (invitation.organizationId !== session!.user.organizationId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!isOrgAdmin && invitation.invitedByUserId !== session!.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  if (invitation.acceptedAt) {
    return Response.json({ error: "Cannot revoke an accepted invitation." }, { status: 409 });
  }

  await prisma.orgInvitation.delete({ where: { token: params.token } });
  return new Response(null, { status: 204 });
}
