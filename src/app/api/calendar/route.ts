import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { buildCalendarEvents, getCalendarSourceStatus } from "@/lib/calendar-events";
import {
  startOfMonth, endOfMonth, subDays, startOfDay, endOfDay, differenceInDays, isValid, parseISO,
} from "date-fns";

export type {
  CalendarEvent, EventType, EventUrgency, CalendarAction, CalendarSourceStatus,
} from "@/lib/calendar-events";

/**
 * Cap on the overdue backlog returned to the UI. A neglected org can have
 * hundreds of expired items; rendering them all buries the calendar itself.
 * The count is reported separately so the UI can say "showing 50 of 210".
 */
const MAX_OVERDUE = 50;

/** Guard against a hand-crafted range that would scan years of records. */
const MAX_RANGE_DAYS = 62;

export async function GET(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;

  const accessible = await getAccessiblePropertyIds();
  if (!accessible || accessible.length === 0) {
    return Response.json({
      events: [], overdueEvents: [], overdueTotal: 0, sources: null, snoozedCount: 0,
    });
  }

  const { searchParams } = new URL(req.url);

  // Explicit range wins (the week view asks for exactly its 7 days); otherwise
  // fall back to the year/month the month grid works in.
  let from: Date;
  let to: Date;
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  if (fromParam && toParam) {
    const parsedFrom = parseISO(fromParam);
    const parsedTo = parseISO(toParam);
    if (!isValid(parsedFrom) || !isValid(parsedTo)) {
      return Response.json({ error: "Invalid from or to date" }, { status: 400 });
    }
    from = startOfDay(parsedFrom);
    to = endOfDay(parsedTo);
    if (to < from) {
      return Response.json({ error: "to must not precede from" }, { status: 400 });
    }
    if (differenceInDays(to, from) > MAX_RANGE_DAYS) {
      return Response.json(
        { error: `Range must not exceed ${MAX_RANGE_DAYS} days` },
        { status: 400 }
      );
    }
  } else {
    const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()), 10);
    const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1), 10);
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return Response.json({ error: "Invalid year or month" }, { status: 400 });
    }
    from = startOfMonth(new Date(year, month - 1, 1));
    to = endOfMonth(from);
  }

  // Honour the header property selector. An unknown/unauthorised id narrows to
  // nothing rather than silently falling back to the full portfolio.
  const requested = searchParams.get("propertyId");
  const propertyIds = requested
    ? accessible.filter((id) => id === requested)
    : accessible;

  const today = startOfDay(new Date());
  const overdueFrom = subDays(today, 90);
  const overdueTo = subDays(today, 1);

  // Two windows, one aggregator — the range being viewed, plus the trailing
  // 90 days that feeds the "action required" strip. The 90-day bound applies
  // uniformly to every source, including expired leases.
  const [events, pastEvents] = await Promise.all([
    buildCalendarEvents(propertyIds, from, to),
    buildCalendarEvents(propertyIds, overdueFrom, overdueTo),
  ]);

  const allOverdue = pastEvents.filter((e) => e.isOverdue);
  // Most recently missed first — those are the ones still worth chasing.
  allOverdue.sort((a, b) => b.date.localeCompare(a.date));

  // ── Per-user snoozes ──────────────────────────────────────────────────────
  // Fetched for exactly the events in play rather than the whole table, and
  // expired rows are ignored (a lapsed snooze simply stops applying; the row
  // is tidied on next write, not on every read).
  const now = new Date();
  const inPlay = [...events, ...allOverdue].map((e) => e.id);
  const snoozes = inPlay.length
    ? await prisma.calendarEventSnooze.findMany({
        where: {
          userId: session!.user.id,
          eventId: { in: inPlay },
          OR: [{ until: null }, { until: { gt: now } }],
        },
        select: { eventId: true },
      })
    : [];
  const hidden = new Set(snoozes.map((s) => s.eventId));

  const includeSnoozed = searchParams.get("includeSnoozed") === "true";
  const visibleEvents = includeSnoozed ? events : events.filter((e) => !hidden.has(e.id));
  const visibleOverdue = includeSnoozed ? allOverdue : allOverdue.filter((e) => !hidden.has(e.id));

  // Only when the range is genuinely empty is it worth telling the user which
  // sources have no data at all — that's the difference between "quiet month"
  // and "never configured". Snoozed-to-empty is not unconfigured, so this
  // checks the raw result.
  const sources = events.length === 0 ? await getCalendarSourceStatus(propertyIds) : null;

  return Response.json({
    events: visibleEvents,
    overdueEvents: visibleOverdue.slice(0, MAX_OVERDUE),
    overdueTotal: visibleOverdue.length,
    sources,
    snoozedCount: hidden.size,
  });
}
