import { requireManager, requireManagerWrite, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { redactFeedToken } from "@/lib/calendar-feed-auth";
import { z } from "zod";

const MAX_FEEDS_PER_USER = 5;

const createSchema = z.object({
  label: z.string().trim().min(1).max(60),
  // Empty / omitted = every property the user can access, resolved live.
  propertyIds: z.array(z.string().min(1)).max(100).optional(),
});

/** GET /api/calendar-feeds — the caller's own feed tokens. */
export async function GET() {
  const { session, error } = await requireManager();
  if (error) return error;

  const feeds = await prisma.calendarFeedToken.findMany({
    where: { userId: session!.user.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      token: true,
      propertyIds: true,
      createdAt: true,
      lastAccessedAt: true,
    },
  });

  return Response.json({ feeds });
}

/** POST /api/calendar-feeds — mint a new subscribe URL. */
export async function POST(req: Request) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const userId = session!.user.id;

  const active = await prisma.calendarFeedToken.count({
    where: { userId, revokedAt: null },
  });
  if (active >= MAX_FEEDS_PER_USER) {
    return Response.json(
      { error: `You can have at most ${MAX_FEEDS_PER_USER} calendar feeds. Revoke one first.` },
      { status: 400 }
    );
  }

  // Narrow any requested scope to what this user may actually see, so a feed
  // can never be minted wider than its owner's access.
  let propertyIds: string[] = [];
  if (parsed.data.propertyIds?.length) {
    const accessible = await getAccessiblePropertyIds();
    if (!accessible) return Response.json({ error: "Unauthorized" }, { status: 401 });
    propertyIds = parsed.data.propertyIds.filter((id) => accessible.includes(id));
    if (propertyIds.length === 0) {
      return Response.json({ error: "No accessible properties selected" }, { status: 400 });
    }
  }

  const feed = await prisma.calendarFeedToken.create({
    data: { userId, label: parsed.data.label, propertyIds },
    select: {
      id: true,
      label: true,
      token: true,
      propertyIds: true,
      createdAt: true,
      lastAccessedAt: true,
    },
  });

  await logAudit({
    userId,
    userEmail: session!.user.email,
    action: "CREATE",
    resource: "CalendarFeedToken",
    resourceId: feed.id,
    organizationId: session!.user.organizationId,
    after: {
      label: feed.label,
      propertyIds: feed.propertyIds,
      token: redactFeedToken(feed.token),
    },
  });

  return Response.json({ feed }, { status: 201 });
}
