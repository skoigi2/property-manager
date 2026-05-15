import { requireAuth, getAccessiblePropertyIds, requireSuperAdmin } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/hints — list ACTIVE hints scoped to the caller's accessible properties.
 * Super-admin gets all hints across all orgs (for the /admin/hints debug page).
 */
export async function GET(req: Request) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const includeAllStatuses = searchParams.get("includeAllStatuses") === "true";

  // Super-admin: optionally return everything for /admin/hints
  if (session!.user.role === "ADMIN" && !session!.user.organizationId) {
    const all = await prisma.actionableHint.findMany({
      where: includeAllStatuses ? {} : { status: "ACTIVE" },
      include: {
        property: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
      },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 500,
    });
    return Response.json(all);
  }

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Hide hints snoozed by the current user
  const userId = session!.user.id;
  const snoozes = await prisma.hintSnooze.findMany({
    where: { userId, until: { gt: new Date() } },
    select: { hintId: true },
  });
  const snoozedIds = snoozes.map((s) => s.hintId);

  const hints = await prisma.actionableHint.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { propertyId: { in: propertyIds } },
        { propertyId: null, organizationId: session!.user.organizationId ?? "_" },
      ],
      ...(snoozedIds.length > 0 ? { id: { notIn: snoozedIds } } : {}),
    },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
  });

  return Response.json(hints);
}
