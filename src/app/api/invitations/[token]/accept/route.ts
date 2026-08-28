import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import {
  invitationProblem,
  assertTeamCapacityForInvite,
  applyInvitationAcceptance,
} from "@/lib/invitation-accept";

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
  // A manager's request is inert until an admin approves it
  if (invitation.status === "REQUESTED") {
    return Response.json({ error: "Invitation not found." }, { status: 404 });
  }
  const problem = invitationProblem(invitation);
  if (problem === "accepted") {
    return Response.json({ error: "This invitation has already been accepted." }, { status: 410 });
  }
  if (problem === "expired") {
    return Response.json({ error: "This invitation has expired." }, { status: 410 });
  }

  // Security: logged-in user must match the invited email
  if (session!.user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
    return Response.json(
      { error: "This invitation was sent to a different email address." },
      { status: 403 }
    );
  }

  // Team-cap re-check: the org may have filled up since the invite was sent.
  // Existing members are never blocked from re-accepting.
  const capacityError = await assertTeamCapacityForInvite(invitation.organizationId, session!.user.id);
  if (capacityError) return capacityError;

  const result = await applyInvitationAcceptance({ userId: session!.user.id, invitation });

  return Response.json({ ok: true, ...result });
}
