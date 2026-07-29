import { buildCalendarEvents } from "@/lib/calendar-events";
import { calendarEventsToIcs, feedWindow } from "@/lib/calendar-ics";
import {
  validateCalendarFeedToken,
  touchCalendarFeedToken,
} from "@/lib/calendar-feed-auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/calendar/feed/[token] — public, token-authenticated ICS feed.
 *
 * Public by virtue of living under /api, which the middleware matcher excludes
 * wholesale (see src/middleware.ts `config.matcher`); auth is enforced here by
 * the token itself, exactly as the portal and approval routes do.
 *
 * The window is a fixed rolling now−90d…now+365d, recomputed per request. Query
 * parameters are deliberately ignored: calendar clients poll on their own
 * schedule and will happily replay a stale URL forever, so the server owns the
 * range rather than trusting whatever a client cached months ago.
 */
export async function GET(
  req: Request,
  { params }: { params: { token: string } }
) {
  const ip = getClientIp(req);
  const limit = rateLimit(`calendar-feed:${ip}`, { max: 60, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) },
    });
  }

  const result = await validateCalendarFeedToken(params.token);
  // Revoked, unknown and no-longer-authorised all look identical from outside.
  if (!result) return new Response("Not found", { status: 404 });

  const { feed, propertyIds } = result;

  const { from, to } = feedWindow();
  const events = await buildCalendarEvents(propertyIds, from, to);

  const origin =
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;

  const ics = calendarEventsToIcs(events, {
    origin,
    name: feed.label || "GroundWorkPM",
    description: "Lease, compliance, maintenance and rent dates from GroundWorkPM.",
  });

  touchCalendarFeedToken(feed.id);

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // Never `public` — the token sits in the URL, so a shared cache holding
      // this response would serve one manager's calendar to another.
      "Cache-Control": "private, max-age=1800",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Disposition": 'inline; filename="groundworkpm.ics"',
    },
  });
}
