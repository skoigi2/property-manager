import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { buildCalendarEvents } from "@/lib/calendar-events";
import { calendarEventsToIcs, feedWindow } from "@/lib/calendar-ics";

export const maxDuration = 30;

/**
 * GET /api/calendar/export[?propertyId=] — one-off .ics download.
 *
 * Same window, same aggregator and same serializer as the subscribe feed; the
 * only difference is session auth instead of a token, and an attachment
 * disposition. A snapshot, not a subscription — it will not stay in sync.
 */
export async function GET(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const accessible = await getAccessiblePropertyIds();
  if (!accessible || accessible.length === 0) {
    return Response.json({ error: "No accessible properties" }, { status: 404 });
  }

  const requested = new URL(req.url).searchParams.get("propertyId");
  const propertyIds = requested
    ? accessible.filter((id) => id === requested)
    : accessible;

  const { from, to } = feedWindow();
  const events = await buildCalendarEvents(propertyIds, from, to);

  const origin =
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;

  const ics = calendarEventsToIcs(events, {
    origin,
    name: "GroundWorkPM",
    description: "Snapshot export — this file does not update automatically.",
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Disposition": 'attachment; filename="groundworkpm-calendar.ics"',
    },
  });
}
