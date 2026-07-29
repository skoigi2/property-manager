import { buildIcsCalendar, type IcsEvent } from "@/lib/ics";
import type { CalendarEvent } from "@/lib/calendar-events";

/**
 * Maps domain calendar events onto iCalendar entries. Shared by the
 * subscribe-by-URL feed and the one-off .ics download so the two can't drift.
 *
 * Privacy: the ICS body travels to Google/Apple/Microsoft and is cached on
 * every synced device, so it deliberately carries the *minimum* — event kind,
 * unit, property. Tenant names and amounts stay behind auth, reachable through
 * the URL property.
 */
export function calendarEventsToIcs(
  events: CalendarEvent[],
  opts: { origin: string; name: string; description?: string }
): string {
  const icsEvents: IcsEvent[] = events.map((e) => {
    const location = e.unitName
      ? `${e.propertyName} — Unit ${e.unitName}`
      : e.propertyName;

    return {
      // Stable per event — the whole point of the `{type}-{refId}` id scheme.
      // A changing UID makes every refresh append duplicates instead of
      // updating in place.
      uid: `${e.id}@groundworkpm.com`,
      date: e.date,
      summary: e.feedSummary,
      location,
      description: `Open in GroundWorkPM: ${opts.origin}${e.link}`,
      url: `${opts.origin}${e.link}`,
    };
  });

  return buildIcsCalendar(icsEvents, {
    name: opts.name,
    description: opts.description,
    refreshInterval: "PT6H",
  });
}

/** Rolling feed window: recent history plus a year ahead. */
export function feedWindow(now: Date = new Date()): { from: Date; to: Date } {
  const from = new Date(now);
  from.setDate(from.getDate() - 90);
  from.setHours(0, 0, 0, 0);

  const to = new Date(now);
  to.setDate(to.getDate() + 365);
  to.setHours(23, 59, 59, 999);

  return { from, to };
}
