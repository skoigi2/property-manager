import { requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { addDays, addHours, addWeeks } from "date-fns";

/**
 * Per-user "not now" on a calendar event.
 *
 * Keyed on the stable CalendarEvent id rather than a FK, because events are
 * derived across several tables. Per-user by design: one manager parking a
 * renewal must not hide it from a colleague.
 */

const PRESETS = ["1h", "1d", "1w", "dismiss"] as const;

const schema = z.object({
  eventId: z.string().min(1).max(200),
  until: z.enum(PRESETS),
});

function resolveUntil(preset: (typeof PRESETS)[number]): Date | null {
  const now = new Date();
  switch (preset) {
    case "1h": return addHours(now, 1);
    case "1d": return addDays(now, 1);
    case "1w": return addWeeks(now, 1);
    // null = hidden indefinitely, until explicitly restored.
    case "dismiss": return null;
  }
}

export async function POST(req: Request) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const userId = session!.user.id;
  const until = resolveUntil(parsed.data.until);

  const row = await prisma.calendarEventSnooze.upsert({
    where: { userId_eventId: { userId, eventId: parsed.data.eventId } },
    create: { userId, eventId: parsed.data.eventId, until },
    update: { until },
    select: { eventId: true, until: true },
  });

  return Response.json({ snooze: row });
}

/** DELETE /api/calendar/snooze?eventId=… — restore one, or all when omitted. */
export async function DELETE(req: Request) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const userId = session!.user.id;
  const eventId = new URL(req.url).searchParams.get("eventId");

  const result = await prisma.calendarEventSnooze.deleteMany({
    where: { userId, ...(eventId ? { eventId } : {}) },
  });

  return Response.json({ restored: result.count });
}
