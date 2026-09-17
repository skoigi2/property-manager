import { validatePortalToken } from "@/lib/portal-auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { tenantUtilitiesResponse } from "@/lib/tenant-utility-response";

export const maxDuration = 30;

/**
 * GET /api/portal/[token]/utilities[?format=pdf] — the tenant's own water &
 * electricity: approved meter readings with the meter photo, each charge's
 * invoice and paid / part-paid / unpaid status, and what is still owed per
 * utility. Read-only; the token IS the scope — only readings snapshotted to
 * this tenant are returned, so another unit's meters, the bulk / common
 * meters and any reading the manager has not approved are unreachable by
 * construction.
 */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const limit = rateLimit(`portal-utilities:${getClientIp(req)}`, { max: 120, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) return Response.json({ error: "Too many requests. Please try again later." }, { status: 429 });

  const tenant = await validatePortalToken(params.token);
  if (!tenant) return Response.json({ error: "Invalid or expired link" }, { status: 404 });

  return tenantUtilitiesResponse(tenant.id, new URL(req.url).searchParams.get("format"));
}
