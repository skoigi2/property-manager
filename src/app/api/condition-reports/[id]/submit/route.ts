import { requireOpsStaffWrite } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";
import { loadInspection, loadUnitMeters, markSubmitted, serializeInspection, submitInputFor } from "@/lib/inspections";
import { submitProblems } from "@/lib/inspection-rules";
import { notifyInspectionSubmitted } from "@/lib/inspection-notify";

// Hand the inspection in: findings lock and the managers are emailed.
export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, error } = await requireOpsStaffWrite();
  if (error) return error;
  const loaded = await loadInspection(params.id);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });

  const problems = submitProblems(submitInputFor(loaded.report, await loadUnitMeters(loaded.report.unitId)));
  if (problems.length) {
    return Response.json({ error: problems[0], problems, code: "NOT_READY" }, { status: 400 });
  }
  const updated = await markSubmitted(loaded.report, session!);

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "ConditionReport",
    resourceId: updated.id,
    organizationId: updated.organizationId,
    before: { status: loaded.report.status },
    after: { status: "SUBMITTED", photos: updated.photos.length, tenantSignOff: updated.tenantSignOff },
  });
  await notifyInspectionSubmitted(updated.id, session!.user.id);

  return Response.json(await serializeInspection(updated, session!));
}
