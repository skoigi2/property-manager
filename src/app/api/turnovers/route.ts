import { requireOpsStaff, requireManagerWrite, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { listTurnovers, startTurnover, loadTurnover } from "@/lib/turnover-data";

// "Ready to re-let" checklists. Ops staff incl. CARETAKER read and tick them
// (src/app/api/turnovers/[id]); a manager starts one by hand (normally a
// finalised checkout starts it). GET ?view=open|done&propertyId=

export async function GET(req: Request) {
  const { error } = await requireOpsStaff();
  if (error) return error;
  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const propertyId = url.searchParams.get("propertyId");
  const scope = propertyId ? propertyIds.filter((id) => id === propertyId) : propertyIds;
  return Response.json(await listTurnovers(scope, url.searchParams.get("view") === "done" ? "done" : "open"));
}

const startSchema = z.object({ unitId: z.string().min(1), conditionReportId: z.string().nullable().optional() });

export async function POST(req: Request) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;
  const parsed = startSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Pick a unit" }, { status: 400 });
  const propertyIds = await getAccessiblePropertyIds();
  const unit = await prisma.unit.findUnique({
    where: { id: parsed.data.unitId },
    select: { id: true, propertyId: true, property: { select: { organizationId: true } } },
  });
  if (!unit || !propertyIds?.includes(unit.propertyId)) return Response.json({ error: "Unit not found" }, { status: 404 });

  let conditionReportId: string | null = null;
  let tenantId: string | null = null;
  if (parsed.data.conditionReportId) {
    const r = await prisma.conditionReport.findUnique({ where: { id: parsed.data.conditionReportId }, select: { unitId: true, tenantId: true } });
    if (!r || r.unitId !== unit.id) return Response.json({ error: "That inspection is not on this unit" }, { status: 400 });
    conditionReportId = parsed.data.conditionReportId;
    tenantId = r.tenantId;
  }

  const t = await startTurnover({
    unitId: unit.id, propertyId: unit.propertyId, organizationId: unit.property.organizationId,
    tenantId, conditionReportId,
  });
  await logAudit({
    userId: session!.user.id, userEmail: session!.user.email, action: "CREATE", resource: "UnitTurnover",
    resourceId: t.id, organizationId: unit.property.organizationId, after: { unitId: unit.id, conditionReportId },
  });
  const loaded = await loadTurnover(t.id);
  return Response.json(loaded?.view, { status: 201 });
}
