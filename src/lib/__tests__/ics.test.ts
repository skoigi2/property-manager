import { describe, it, expect } from "vitest";
import { buildIcsCalendar, type IcsEvent } from "@/lib/ics";

const baseEvent: IcsEvent = {
  uid: "LEASE_EXPIRY-abc123@groundworkpm.com",
  date: "2026-07-29",
  summary: "Lease expires — Unit 4B",
  timestamp: new Date("2026-07-29T10:30:00.000Z"),
};

function build(events: IcsEvent[] = [baseEvent]) {
  return buildIcsCalendar(events, { name: "GroundWorkPM" });
}

describe("buildIcsCalendar", () => {
  it("uses CRLF line endings throughout and terminates with one", () => {
    const ics = build();
    // No bare LF anywhere — several clients reject LF-only files outright.
    expect(ics.split("\r\n").join("")).not.toContain("\n");
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  it("emits the required calendar envelope and refresh hints", () => {
    const ics = build();
    expect(ics).toContain("BEGIN:VCALENDAR\r\nVERSION:2.0");
    expect(ics).toContain("METHOD:PUBLISH");
    expect(ics).toContain("X-WR-CALNAME:GroundWorkPM");
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT6H");
    expect(ics).toContain("X-PUBLISHED-TTL:PT6H");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("writes an all-day event with an exclusive DTEND one day later", () => {
    const ics = build();
    expect(ics).toContain("DTSTART;VALUE=DATE:20260729");
    // Exclusive end — without the +1 a one-day event renders as zero-length,
    // with more than +1 it renders as multi-day.
    expect(ics).toContain("DTEND;VALUE=DATE:20260730");
  });

  it("rolls DTEND over month and year boundaries", () => {
    const dec = build([{ ...baseEvent, date: "2026-12-31" }]);
    expect(dec).toContain("DTEND;VALUE=DATE:20270101");

    const feb = build([{ ...baseEvent, date: "2028-02-29" }]);
    expect(feb).toContain("DTEND;VALUE=DATE:20280301");
  });

  it("stamps every event with DTSTAMP", () => {
    const ics = build([baseEvent, { ...baseEvent, uid: "b@x" }]);
    expect(ics.match(/DTSTAMP:/g)).toHaveLength(2);
    expect(ics).toContain("DTSTAMP:20260729T103000Z");
  });

  it("keeps the UID verbatim so refreshes update rather than duplicate", () => {
    const ics = build();
    expect(ics).toContain("UID:LEASE_EXPIRY-abc123@groundworkpm.com");
  });

  it("escapes backslash, semicolon, comma and newlines in TEXT values", () => {
    const ics = build([
      {
        ...baseEvent,
        summary: "A,B;C\\D",
        description: "line one\nline two",
      },
    ]);
    expect(ics).toContain("SUMMARY:A\\,B\\;C\\\\D");
    expect(ics).toContain("DESCRIPTION:line one\\nline two");
  });

  it("normalises CRLF inside a TEXT value to a single escaped newline", () => {
    const ics = build([{ ...baseEvent, description: "one\r\ntwo" }]);
    expect(ics).toContain("DESCRIPTION:one\\ntwo");
    expect(ics).not.toContain("\\n\\ntwo");
  });

  it("does not escape commas in a URL value", () => {
    const ics = build([
      { ...baseEvent, url: "https://app.example.com/invoices?focus=a,b" },
    ]);
    // URI values are not TEXT — escaping here would corrupt the link.
    expect(ics).toContain("URL:https://app.example.com/invoices?focus=a,b");
  });

  it("folds lines longer than 75 octets with a leading-space continuation", () => {
    const ics = build([{ ...baseEvent, summary: "x".repeat(200) }]);
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(ics).toContain("\r\n x");
  });

  it("folds on octet boundaries without splitting a multi-byte character", () => {
    // Each 'é' is 2 bytes; a naive character-count fold corrupts one at the seam.
    const ics = build([{ ...baseEvent, summary: "é".repeat(80) }]);
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    // Round-tripping the unfolded value must give back every character intact.
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(`SUMMARY:${"é".repeat(80)}`);
  });

  it("omits optional properties that were not supplied", () => {
    const ics = build();
    expect(ics).not.toContain("DESCRIPTION:");
    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("URL:");
  });

  it("produces a valid empty calendar when there are no events", () => {
    const ics = build([]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });
});
