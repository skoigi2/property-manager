import { z } from "zod";
import { requireManager, requireManagerWrite, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import {
  loadRentReviewContext,
  scheduleRentIncrease,
  skipRentReview,
  RentIncreaseError,
} from "@/lib/rent-increase";

// Rent review for one tenant: the escalation terms, the next review and its
// proposal, and any scheduled (not yet applied) increase.

async function tenantPropertyId(tenantId: string): Promise<string | null> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { unit: { select: { propertyId: true } } } });
  return t?.unit.propertyId ?? null;
}

/** "YYYY-MM-DD" → local midnight (never a UTC shift into the previous day). */
function parseDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error } = await requireManager();
  if (error) return error;
  const propertyId = await tenantPropertyId(params.id);
  if (!propertyId) return Response.json({ error: "Not found" }, { status: 404 });
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  const ctx = await loadRentReviewContext(params.id);
  if (!ctx) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({
    terms: ctx.terms,
    hasTerms: ctx.hasTerms,
    noticeDays: ctx.noticeDays,
    currentRent: ctx.tenant.monthlyRent,
    isActive: ctx.tenant.isActive,
    hasEmail: !!ctx.tenant.email?.trim(),
    review: ctx.review,
    scheduled: ctx.scheduled.map((r) => ({
      id: r.id,
      monthlyRent: r.monthlyRent,
      effectiveDate: r.effectiveDate,
      reason: r.reason,
      noticeSentAt: r.noticeSentAt,
      createdByName: r.createdByName,
      createdAt: r.createdAt,
    })),
  });
}

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("schedule"),
    newRent: z.number().positive(),
    effectiveDate: z.string(),
    reason: z.string().max(200).optional().nullable(),
    acceptShortNotice: z.boolean().optional(),
  }),
  z.object({ action: z.literal("skip"), note: z.string().max(200).optional().nullable() }),
]);

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error, session } = await requireManagerWrite();
  if (error) return error;
  const propertyId = await tenantPropertyId(params.id);
  if (!propertyId) return Response.json({ error: "Not found" }, { status: 404 });
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const ownerRow = await prisma.tenant.findUnique({ where: { id: params.id }, select: { isUnitOwner: true } });
  if (ownerRow?.isUnitOwner) return Response.json({ error: "A unit owner pays only the service charge — there is no rent to review." }, { status: 400 });
  const actor = {
    userId: session!.user.id,
    email: session!.user.email,
    name: session!.user.name,
    organizationId: session!.user.organizationId,
  };

  try {
    if (parsed.data.action === "skip") {
      await skipRentReview(params.id, parsed.data.note ?? null, actor);
      return Response.json({ ok: true });
    }
    const effectiveDate = parseDay(parsed.data.effectiveDate);
    if (!effectiveDate) return Response.json({ error: "Pick a valid effective date" }, { status: 400 });
    const row = await scheduleRentIncrease(
      params.id,
      {
        newRent: parsed.data.newRent,
        effectiveDate,
        reason: parsed.data.reason,
        acceptShortNotice: parsed.data.acceptShortNotice,
      },
      actor,
    );
    return Response.json(row, { status: 201 });
  } catch (e) {
    if (e instanceof RentIncreaseError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
    throw e;
  }
}
