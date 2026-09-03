import { requireSession } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/invitations/my
 * Returns pending (non-expired, non-accepted) invitations addressed to the
 * logged-in user's email. Used to surface in-app invite notifications.
 */
export async function GET() {
  const { error, session } = await requireSession(); // any role — InviteBanner polls this
  if (error) return error;

  const email = session!.user.email;
  if (!email) return Response.json([]);

  const invitations = await prisma.orgInvitation.findMany({
    where: {
      email:      email.toLowerCase(),
      status:     "SENT",   // a manager's REQUESTED row can't be accepted yet
      acceptedAt: null,
      expiresAt:  { gt: new Date() },
    },
    include: {
      organization: { select: { name: true } },
      invitedBy:    { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(invitations);
}
