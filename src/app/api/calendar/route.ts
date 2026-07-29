import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { buildCalendarEvents } from "@/lib/calendar-events";
import { startOfMonth, endOfMonth, subDays, startOfDay } from "date-fns";

export type { CalendarEvent, EventType, EventUrgency, CalendarAction } from "@/lib/calendar-events";

/**
 * Cap on the overdue backlog returned to the UI. A neglected org can have
 * hundreds of expired items; rendering them all buries the calendar itself.
 * The count is reported separately so the UI can say "showing 50 of 210".
 */
const MAX_OVERDUE = 50;

export async function GET(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const accessible = await getAccessiblePropertyIds();
  if (!accessible || accessible.length === 0) {
    return Response.json({ events: [], overdueEvents: [], overdueTotal: 0 });
  }

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()), 10);
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1), 10);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return Response.json({ error: "Invalid year or month" }, { status: 400 });
  }

  // Honour the header property selector. An unknown/unauthorised id narrows to
  // nothing rather than silently falling back to the full portfolio.
  const requested = searchParams.get("propertyId");
  const propertyIds = requested
    ? accessible.filter((id) => id === requested)
    : accessible;

  const from = startOfMonth(new Date(year, month - 1, 1));
  const to = endOfMonth(from);

  const today = startOfDay(new Date());
  const overdueFrom = subDays(today, 90);
  const overdueTo = subDays(today, 1);

  // Two windows, one aggregator — the month being viewed, plus the trailing
  // 90 days that feeds the "action required" strip. The 90-day bound now
  // applies uniformly to every source, including expired leases.
  const [events, pastEvents] = await Promise.all([
    buildCalendarEvents(propertyIds, from, to),
    buildCalendarEvents(propertyIds, overdueFrom, overdueTo),
  ]);

  const allOverdue = pastEvents.filter((e) => e.isOverdue);
  // Most recently missed first — those are the ones still worth chasing.
  allOverdue.sort((a, b) => b.date.localeCompare(a.date));

  return Response.json({
    events,
    overdueEvents: allOverdue.slice(0, MAX_OVERDUE),
    overdueTotal: allOverdue.length,
    year,
    month,
  });
}
