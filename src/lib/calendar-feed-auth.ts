import { prisma } from "@/lib/prisma";
import { getAccessiblePropertyIdsForUser } from "@/lib/auth-utils";

/**
 * Auth for the calendar ICS feed. Mirrors src/lib/portal-auth.ts: a single
 * validate call that every feed route makes first, returning null for any
 * reason the caller must not distinguish.
 *
 * Property scope is resolved LIVE on every fetch rather than trusted from the
 * token row, so losing PropertyAccess (or an org switch) immediately narrows an
 * already-subscribed feed. The token grants a view, never a fixed dataset.
 */
export async function validateCalendarFeedToken(token: string) {
  if (!token) return null;

  const feed = await prisma.calendarFeedToken.findUnique({
    where: { token },
    select: {
      id: true,
      userId: true,
      label: true,
      propertyIds: true,
      revokedAt: true,
    },
  });

  if (!feed || feed.revokedAt) return null;

  const accessible = await getAccessiblePropertyIdsForUser(feed.userId);
  if (!accessible || accessible.length === 0) return null;

  // An empty propertyIds list means "everything I can see". A non-empty list is
  // intersected with live access — a token can never widen its own scope.
  const propertyIds =
    feed.propertyIds.length > 0
      ? accessible.filter((id) => feed.propertyIds.includes(id))
      : accessible;

  if (propertyIds.length === 0) return null;

  return { feed, propertyIds };
}

/**
 * Record that the feed was polled. Fire-and-forget: a calendar client must
 * never get a 500 because a bookkeeping write failed.
 */
export function touchCalendarFeedToken(id: string): void {
  void prisma.calendarFeedToken
    .update({ where: { id }, data: { lastAccessedAt: new Date() } })
    .catch(() => {});
}

/** Show only the last 4 chars of a token in logs. */
export function redactFeedToken(token: string): string {
  if (!token || token.length <= 4) return "***";
  return `***${token.slice(-4)}`;
}
