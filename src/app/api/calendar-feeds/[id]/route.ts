import { requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { redactFeedToken } from "@/lib/calendar-feed-auth";

/**
 * DELETE /api/calendar-feeds/[id] — revoke a feed.
 *
 * Soft-revoke rather than delete: `revokedAt` keeps the audit trail meaningful
 * and guarantees the token can never be reissued to someone else.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const feed = await prisma.calendarFeedToken.findUnique({
    where: { id: params.id },
    select: { id: true, userId: true, label: true, token: true, revokedAt: true },
  });

  // Someone else's feed is reported as missing, not forbidden.
  if (!feed || feed.userId !== session!.user.id || feed.revokedAt) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.calendarFeedToken.update({
    where: { id: feed.id },
    data: { revokedAt: new Date() },
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "DELETE",
    resource: "CalendarFeedToken",
    resourceId: feed.id,
    organizationId: session!.user.organizationId,
    before: { label: feed.label, token: redactFeedToken(feed.token) },
  });

  return Response.json({ ok: true });
}
