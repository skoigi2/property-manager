import { requireAdmin } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { sendOrgInvitation } from "@/lib/email";
import { canAddUser } from "@/lib/subscription";
import { logAudit } from "@/lib/audit";

/**
 * POST /api/invitations/[token]/approve
 * Admin approval of a manager-REQUESTED team-member addition: flips the row
 * to SENT, resets the 48h expiry, and emails the invitation.
 */
export async function POST(_req: Request, { params }: { params: { token: string } }) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const invitation = await prisma.orgInvitation.findUnique({
    where: { token: params.token },
    include: { organization: { select: { name: true } } },
  });
  if (!invitation) return Response.json({ error: "Request not found." }, { status: 404 });

  const isSuperAdmin = session!.user.role === "ADMIN" && !session!.user.organizationId;
  if (!isSuperAdmin && invitation.organizationId !== session!.user.organizationId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (invitation.status !== "REQUESTED") {
    return Response.json({ error: "This invitation is not awaiting approval." }, { status: 409 });
  }
  if (invitation.acceptedAt) {
    return Response.json({ error: "Already accepted." }, { status: 409 });
  }

  // Team cap applies at approval (the request itself never consumed it)
  const capacityOk = await canAddUser(invitation.organizationId);
  if (!capacityOk) {
    return Response.json(
      { error: "Team-member limit reached for your plan. Upgrade to add more.", code: "TEAM_LIMIT_REACHED" },
      { status: 402 },
    );
  }

  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  await prisma.orgInvitation.update({
    where: { token: params.token },
    data:  { status: "SENT", expiresAt },
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://groundworkpm.com";
  sendOrgInvitation(
    invitation.email,
    session!.user.name ?? session!.user.email ?? "A team member",
    invitation.organization.name,
    invitation.role,
    `${baseUrl}/invite/${invitation.token}`,
    expiresAt,
    { organizationId: invitation.organizationId },
  ).catch(console.error);

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "OrgInvitation",
    resourceId: invitation.id,
    organizationId: invitation.organizationId,
    before: { status: "REQUESTED" },
    after: { status: "SENT", email: invitation.email, role: invitation.role },
  });

  return Response.json({ ok: true });
}
