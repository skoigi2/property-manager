import { requireOpsStaffWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { loadInspection, loadUnitMeters, markSubmitted, serializeInspection, submitInputFor, INSPECTION_INCLUDE } from "@/lib/inspections";
import { isCleanPostStay, submitProblems, type InspectionItem } from "@/lib/inspection-rules";
import { notifyInspectionSubmitted } from "@/lib/inspection-notify";

// Hand the inspection in: findings lock and the managers are emailed. A clean
// post-stay check (no damage, nothing raised) is filed as accepted straight
// away — nothing for a manager to review after every stay.
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
  let updated = await markSubmitted(loaded.report, session!);
  const clean = isCleanPostStay({
    reportType: updated.reportType,
    items: (updated.items as unknown as InspectionItem[]) ?? [],
    tenantIssues: updated.tenantIssues,
  });
  if (clean) {
    updated = await prisma.conditionReport.update({
      where: { id: updated.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
      include: INSPECTION_INCLUDE,
    });
  }

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "ConditionReport",
    resourceId: updated.id,
    organizationId: updated.organizationId,
    before: { status: loaded.report.status },
    after: { status: updated.status, photos: updated.photos.length, tenantSignOff: updated.tenantSignOff, ...(clean ? { autoAccepted: "clean post-stay check" } : {}) },
  });
  if (!clean) await notifyInspectionSubmitted(updated.id, session!.user.id);

  return Response.json(await serializeInspection(updated, session!));
}
