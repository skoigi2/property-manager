import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// ── GET /api/tenants/[id]/rent-history ───────────────────────────────────────
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const accessibleIds = await getAccessiblePropertyIds();
  if (!accessibleIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: { unit: true },
  });
  if (!tenant || !accessibleIds.includes(tenant.unit.propertyId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const history = await prisma.rentHistory.findMany({
    where: { tenantId: params.id },
    orderBy: { effectiveDate: "desc" },
  });

  return Response.json(history);
}

// ── POST /api/tenants/[id]/rent-history ──────────────────────────────────────
// Manual entry for historical records or corrections
const bodySchema = z.object({
  monthlyRent:   z.number().positive(),
  effectiveDate: z.string(),
  reason:        z.string().max(200).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const accessibleIds = await getAccessiblePropertyIds();
  if (!accessibleIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: { unit: true },
  });
  if (!tenant || !accessibleIds.includes(tenant.unit.propertyId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const record = await prisma.rentHistory.create({
    data: {
      tenantId:     params.id,
      monthlyRent:  parsed.data.monthlyRent,
      effectiveDate: new Date(parsed.data.effectiveDate),
      reason:        parsed.data.reason ?? null,
    },
  });

  return Response.json(record, { status: 201 });
}

// ── DELETE /api/tenants/[id]/rent-history?entryId= ───────────────────────────
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const accessibleIds = await getAccessiblePropertyIds();
  if (!accessibleIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const entryId = searchParams.get("entryId");
  if (!entryId) return Response.json({ error: "entryId required" }, { status: 400 });

  const entry = await prisma.rentHistory.findUnique({
    where: { id: entryId },
    include: { tenant: { include: { unit: true } } },
  });
  if (!entry || !accessibleIds.includes(entry.tenant.unit.propertyId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.rentHistory.delete({ where: { id: entryId } });
  return new Response(null, { status: 204 });
}
