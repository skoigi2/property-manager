import { NextRequest } from "next/server";
import { z } from "zod";
import { validatePortalToken } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { COMPLAINT_CATEGORIES } from "@/lib/validations";
import { COMPLAINT_INCLUDE, createComplaint, type ComplaintRow } from "@/lib/complaints";
import { COMPLAINT_CATEGORY_LABEL, type ComplaintCategory } from "@/lib/complaint-rules";
import { notifyNewComplaint } from "@/lib/complaint-notify";

/**
 * Tenant portal complaints (token auth — no session, no role helpers).
 *
 * GET  — the tenant's OWN complaints: rows where they are the complainant AND
 *        the source is PORTAL. A complaint staff logged *about* them (or where
 *        they are only the subject unit's occupant) is never listed. Only
 *        timeline COMMENTs flagged visibleToTenant are returned; staff notes
 *        default to hidden.
 * POST — raise a complaint. Creates the TenantComplaint + COMPLAINT case and
 *        emails the property's managers.
 */

const createSchema = z.object({
  category:    z.enum(COMPLAINT_CATEGORIES).default("OTHER"),
  title:       z.string().trim().min(3, "Tell us what the complaint is about (at least 3 characters)").max(200),
  description: z.string().trim().max(5000).optional().nullable(),
});

function portalShape(c: ComplaintRow, events: { id: string; kind: string; body: string | null; meta: unknown; actorUserId: string | null; actorName: string | null; createdAt: Date }[]) {
  const ct = c.caseThread;
  const updates = events
    .filter((e) => e.kind === "COMMENT" && !!e.body && (e.meta as { visibleToTenant?: boolean } | null)?.visibleToTenant === true)
    .map((e) => ({ id: e.id, body: e.body!, at: e.createdAt, byStaff: !!e.actorUserId, staffName: e.actorUserId ? e.actorName : null }));
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    category: c.category,
    categoryLabel: COMPLAINT_CATEGORY_LABEL[c.category as ComplaintCategory] ?? c.category,
    status: ct?.status ?? "OPEN",
    stage: ct?.stage ?? "Received",
    isResolved: ct?.status === "RESOLVED" || ct?.status === "CLOSED",
    unitConcerned: c.subjectUnit?.unitNumber ?? null,
    acknowledgedAt: c.acknowledgedAt,
    resolvedAt: c.resolvedAt,
    createdAt: c.createdAt,
    updates,
  };
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const tenant = await validatePortalToken(params.token);
  if (!tenant) return Response.json({ error: "Invalid or expired link" }, { status: 404 });

  const rows = await prisma.tenantComplaint.findMany({
    where: { tenantId: tenant.id, source: "PORTAL" },
    include: COMPLAINT_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const threadIds = rows.map((r) => r.caseThreadId).filter((x): x is string => !!x);
  const events = threadIds.length
    ? await prisma.caseEvent.findMany({
        where: { caseThreadId: { in: threadIds }, kind: "COMMENT" },
        select: { id: true, kind: true, body: true, meta: true, actorUserId: true, actorName: true, createdAt: true, caseThreadId: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const byThread = new Map<string, typeof events>();
  for (const e of events) {
    const list = byThread.get(e.caseThreadId) ?? [];
    list.push(e);
    byThread.set(e.caseThreadId, list);
  }
  return Response.json(rows.map((r) => portalShape(r, r.caseThreadId ? byThread.get(r.caseThreadId) ?? [] : [])));
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const ip = getClientIp(req);
  const limit = rateLimit(`portal-complaint:${ip}`, { max: 20, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) return Response.json({ error: "Too many requests — please try again later." }, { status: 429 });

  const tenant = await validatePortalToken(params.token);
  if (!tenant) return Response.json({ error: "Invalid or expired link" }, { status: 404 });
  const orgId = tenant.unit.property.organizationId;
  if (!orgId) return Response.json({ error: "Property has no organisation" }, { status: 400 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Invalid input";
    return Response.json({ error: first }, { status: 400 });
  }

  const complaint = await createComplaint({
    propertyId: tenant.unit.property.id,
    organizationId: orgId,
    unitId: tenant.unitId,
    tenantId: tenant.id,
    subjectUnitId: null,
    category: parsed.data.category,
    title: parsed.data.title,
    description: parsed.data.description || null,
    source: "PORTAL",
    raisedByUserId: null,
    raisedByName: tenant.name,
    // No user behind a portal submission — the timeline actor is the tenant by name.
    actor: { userId: null, email: tenant.email ?? null, name: tenant.name },
  });

  void notifyNewComplaint(complaint.id);

  const events = complaint.caseThreadId
    ? await prisma.caseEvent.findMany({
        where: { caseThreadId: complaint.caseThreadId, kind: "COMMENT" },
        select: { id: true, kind: true, body: true, meta: true, actorUserId: true, actorName: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  return Response.json(portalShape(complaint, events), { status: 201 });
}
