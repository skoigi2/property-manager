/**
 * Minimal RFC 5545 (iCalendar) serializer — hand-rolled, no dependency.
 *
 * The fiddly parts that break real calendar clients, all handled here:
 *  - CRLF line endings (LF-only files are rejected outright by some clients)
 *  - 75-octet line folding, measured in UTF-8 bytes rather than JS characters
 *  - TEXT escaping for `\`, `;`, `,` and newlines
 *  - a stable UID per event, so refreshing updates entries instead of
 *    duplicating them
 *  - DTSTAMP on every VEVENT (required)
 *  - all-day events as DTSTART;VALUE=DATE with an EXCLUSIVE DTEND (+1 day),
 *    which is what stops a one-day event rendering as two
 */

export interface IcsEvent {
  /** Stable identity. Must not change between refreshes for the same event. */
  uid: string;
  /** All-day date, "YYYY-MM-DD". */
  date: string;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  /** Last-modified stamp; defaults to the calendar's generation time. */
  timestamp?: Date;
}

export interface IcsCalendarOptions {
  /** Shown as the calendar name in Google/Outlook/Apple. */
  name: string;
  description?: string;
  /** How often clients are asked to re-poll. ISO 8601 duration. */
  refreshInterval?: string;
}

/** Escape per RFC 5545 §3.3.11. Order matters — backslash must go first. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n/g, "\\n")
    .replace(/[\r\n]/g, "\\n");
}

/**
 * Fold to 75 octets per line, continuation lines prefixed with a single space.
 *
 * The limit is defined in octets, not characters, so a line is measured after
 * UTF-8 encoding and never split mid-codepoint — otherwise any property
 * carrying non-ASCII (a property name with an accent, a currency symbol)
 * produces mojibake at the fold boundary.
 */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  // First line allows 75 octets; continuations lose one to the leading space.
  let limit = 75;

  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    if (currentBytes + charBytes > limit) {
      out.push(current);
      current = char;
      currentBytes = charBytes;
      limit = 74;
    } else {
      current += char;
      currentBytes += charBytes;
    }
  }
  if (current) out.push(current);

  return out.join("\r\n ");
}

/** UTC timestamp form: 20260729T143000Z */
function formatUtcStamp(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/** "YYYY-MM-DD" → "YYYYMMDD" */
function formatDateValue(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

/** Day after `isoDate`, for the exclusive DTEND of an all-day event. */
function nextDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return formatDateValue(next.toISOString().slice(0, 10));
}

export function buildIcsCalendar(
  events: IcsEvent[],
  opts: IcsCalendarOptions
): string {
  const now = new Date();
  const refresh = opts.refreshInterval ?? "PT6H";

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GroundWorkPM//Property Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(opts.name)}`,
    // Both spellings exist in the wild: REFRESH-INTERVAL is the RFC 7986
    // property, X-PUBLISHED-TTL is what older Outlook honours.
    `REFRESH-INTERVAL;VALUE=DURATION:${refresh}`,
    `X-PUBLISHED-TTL:${refresh}`,
  ];

  if (opts.description) {
    lines.push(`X-WR-CALDESC:${escapeText(opts.description)}`);
  }

  for (const ev of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.uid}`);
    lines.push(`DTSTAMP:${formatUtcStamp(ev.timestamp ?? now)}`);
    lines.push(`DTSTART;VALUE=DATE:${formatDateValue(ev.date)}`);
    lines.push(`DTEND;VALUE=DATE:${nextDay(ev.date)}`);
    lines.push(`SUMMARY:${escapeText(ev.summary)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
    // URL is not TEXT-escaped — it's a URI value, and escaping the commas in a
    // query string would corrupt the link.
    if (ev.url) lines.push(`URL:${ev.url}`);
    lines.push("TRANSP:TRANSPARENT");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}
