import { requireAuth, requireManagerWrite, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { buildArrearsCases, findOpenArrearsCase, initialArrearsCaseData } from "@/lib/arrears";
import { z } from "zod";

/**
 * Arrears now reads and writes CaseThread(caseType=ARREARS), not the legacy
 * ArrearsCase table. See src/lib/arrears.ts for why.
 */

const createSchema = z.object({
  tenantId: z.string().min(1),
  propertyId: z.string().min(1),
  notes: z.string().max(2000).optional(),
});

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const filterPropertyId = new URL(req.url).searchParams.get("propertyId");
  const effective =
    filterPropertyId && propertyIds.includes(filterPropertyId)
      ? [filterPropertyId]
      : propertyIds;

  return Response.json(await buildArrearsCases(effective));
}

export async function POST(req: Request) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { tenantId, propertyId, notes } = parsed.data;
  if (!propertyIds.includes(propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, unitId: true, unit: { select: { propertyId: true } } },
  });
  if (!tenant || tenant.unit?.propertyId !== propertyId) {
    return Response.json({ error: "Tenant not found on that property" }, { status: 404 });
  }

  // One open case per tenant. Matching on subjectId means a thread the
  // ARREARS_7D automation already opened is respected rather than duplicated —
  // the divergence that caused the original two-models problem.
  const existing = await findOpenArrearsCase(tenantId);
  if (existing) {
    return Response.json(
      { error: "An open arrears case already exists for this tenant.", caseId: existing.id },
      { status: 409 }
    );
  }

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { organizationId: true },
  });
  if (!property?.organizationId) {
    return Response.json({ error: "Property has no organisation" }, { status: 400 });
  }

  const thread = await prisma.caseThread.create({
    data: initialArrearsCaseData({
      tenantId,
      tenantName: tenant.name,
      propertyId,
      organizationId: property.organizationId,
      unitId: tenant.unitId,
    }),
    select: { id: true },
  });

  await prisma.caseEvent.create({
    data: {
      caseThreadId: thread.id,
      kind: "COMMENT",
      actorUserId: session!.user.id,
      actorEmail: session!.user.email ?? null,
      actorName: session!.user.name ?? session!.user.email ?? "Manager",
      body: notes?.trim()
        ? `Arrears case opened.\n\n${notes.trim()}`
        : "Arrears case opened.",
    },
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "CREATE",
    resource: "CaseThread",
    resourceId: thread.id,
    organizationId: session!.user.organizationId,
    after: { caseType: "ARREARS", subjectId: tenantId, propertyId },
  });

  return Response.json({ id: thread.id }, { status: 201 });
}
