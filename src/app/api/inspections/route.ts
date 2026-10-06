import { requireOpsStaff, requireOpsStaffWrite } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";
import { inspectionCreateSchema } from "@/lib/validations";
import { createInspection, listInspections, serializeInspection } from "@/lib/inspections";
import { notifyInspectionAssigned } from "@/lib/inspection-notify";

// Inspection visits — ops staff incl. CARETAKER (they run them on site).
// GET ?view=open|review|done|all&mine=1&propertyId=&tenantId=

export async function GET(req: Request) {
  const { session, error } = await requireOpsStaff();
  if (error) return error;
  const url = new URL(req.url);
  const view = url.searchParams.get("view");
  const rows = await listInspections({
    view: view === "open" || view === "review" || view === "done" ? view : "all",
    mine: url.searchParams.get("mine") === "1",
    propertyId: url.searchParams.get("propertyId"),
    tenantId: url.searchParams.get("tenantId"),
  }, session!);
  return Response.json(rows);
}

export async function POST(req: Request) {
  const { session, error } = await requireOpsStaffWrite();
  if (error) return error;
  const parsed = inspectionCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  const result = await createInspection(parsed.data, session!);
  if (!result.ok) {
    return Response.json({ error: result.error, ...("existingId" in result ? { existingId: result.existingId } : {}) }, { status: result.status });
  }
  const report = result.report;

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "CREATE",
    resource: "ConditionReport",
    resourceId: report.id,
    organizationId: report.organizationId,
    after: { reportType: report.reportType, unitId: report.unitId, tenantId: report.tenantId, scheduledFor: report.scheduledFor, assignedToUserId: report.assignedToUserId },
  });
  await notifyInspectionAssigned(report.id, { id: session!.user.id, name: session!.user.name ?? session!.user.email ?? "A manager" });

  return Response.json(await serializeInspection(report, session!), { status: 201 });
}
