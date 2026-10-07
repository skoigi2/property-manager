import { requireOpsStaff, requireOpsStaffWrite, requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { conditionReportPatchSchema } from "@/lib/validations";
import { deleteFromStorage } from "@/lib/supabase-storage";
import { logAudit } from "@/lib/audit";
import { loadInspection, loadUnitMeters, serializeInspection, checkAssignee, isInspectionManager, INSPECTION_INCLUDE } from "@/lib/inspections";
import { canEditObservations, invalidPostStayRatings, keysState, normaliseKeys, normaliseMeterReadings } from "@/lib/inspection-rules";
import { notifyInspectionAssigned } from "@/lib/inspection-notify";

// A condition report = an inspection visit. Ops staff incl. CARETAKER read and
// fill it in; what each field may do depends on the status
// (src/lib/inspection-rules.ts). Delete stays with managers.

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, error } = await requireOpsStaff();
  if (error) return error;
  const loaded = await loadInspection(params.id);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });
  return Response.json(await serializeInspection(loaded.report, session!));
}

const OBSERVATION_FIELDS = [
  "reportDate", "items", "overallComments", "signedByTenant", "signedByManager",
  "tenantIssues", "tenantSignOff", "tenantSignedName", "tenantDisagrees", "tenantComments", "meterReadings",
] as const;
const PLANNING_FIELDS = ["reportType", "scheduledFor", "assignedToUserId", "tenantId"] as const;

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, error } = await requireOpsStaffWrite();
  if (error) return error;
  const loaded = await loadInspection(params.id);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });
  const report = loaded.report;

  const parsed = conditionReportPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const data = parsed.data;

  const touchesObservations = OBSERVATION_FIELDS.some((f) => data[f] !== undefined);
  const touchesPlanning = PLANNING_FIELDS.some((f) => data[f] !== undefined);

  if ((touchesObservations || touchesPlanning) && !canEditObservations(report.status)) {
    return Response.json({ error: "This inspection has been handed in — its findings are locked." }, { status: 409 });
  }
  if (data.keys !== undefined) {
    const ks = keysState({ reportType: report.reportType, status: report.status, keysClearedAt: report.keysClearedAt });
    if (ks === "none") return Response.json({ error: "Mid-term inspections don't record keys." }, { status: 400 });
    if (ks === "waiting") return Response.json({ error: "Wait for the manager to confirm the deposit and first rent before handing over keys." }, { status: 409 });
    if (ks === "locked") return Response.json({ error: "This inspection is accepted — the keys record is locked." }, { status: 409 });
  }

  if (report.reportType === "POST_STAY" && data.items && invalidPostStayRatings(data.items)) {
    return Response.json({ error: "A post-stay check rates each room Fine or Damaged." }, { status: 400 });
  }
  // A post-stay check stays tied to its booking: no tenant, no other type.
  if (report.reportType === "POST_STAY" && (data.reportType !== undefined || data.tenantId)) {
    return Response.json({ error: "A post-stay check belongs to its booking — it can't take a tenant or change type." }, { status: 400 });
  }
  if (data.tenantId !== undefined && data.tenantId) {
    const t = await prisma.tenant.findUnique({ where: { id: data.tenantId }, select: { unitId: true } });
    if (!t || t.unitId !== report.unitId) return Response.json({ error: "That tenant is not on this unit." }, { status: 400 });
  }
  if (data.assignedToUserId) {
    const bad = await checkAssignee(data.assignedToUserId, report.property, session!);
    if (bad) return Response.json({ error: bad.error }, { status: bad.status });
  } else if (data.assignedToUserId === null && !isInspectionManager(session!) && report.assignedToUserId !== session!.user.id) {
    return Response.json({ error: "Only a manager can unassign someone else." }, { status: 403 });
  }
  let scheduledFor: Date | null | undefined;
  if (data.scheduledFor !== undefined) {
    scheduledFor = data.scheduledFor ? new Date(data.scheduledFor) : null;
    if (scheduledFor && Number.isNaN(scheduledFor.getTime())) return Response.json({ error: "Invalid date and time." }, { status: 400 });
  }

  const meterReadings = data.meterReadings !== undefined
    ? normaliseMeterReadings(data.meterReadings, await loadUnitMeters(report.unitId))
    : undefined;

  const updated = await prisma.conditionReport.update({
    where: { id: report.id },
    data: {
      ...(touchesObservations && report.status === "SCHEDULED" ? { status: "IN_PROGRESS" as const } : {}),
      ...(data.reportDate !== undefined ? { reportDate: new Date(data.reportDate) } : {}),
      ...(data.items !== undefined ? { items: withStoredJobIds(data.items, report.items) as unknown as Prisma.InputJsonValue } : {}),
      ...(data.overallComments !== undefined ? { overallComments: data.overallComments } : {}),
      ...(data.signedByTenant !== undefined ? { signedByTenant: data.signedByTenant } : {}),
      ...(data.signedByManager !== undefined ? { signedByManager: data.signedByManager } : {}),
      ...(data.tenantIssues !== undefined ? { tenantIssues: data.tenantIssues || null } : {}),
      ...(data.tenantSignOff !== undefined ? { tenantSignOff: data.tenantSignOff } : {}),
      ...(data.tenantSignedName !== undefined ? { tenantSignedName: data.tenantSignedName || null } : {}),
      ...(data.tenantDisagrees !== undefined ? { tenantDisagrees: data.tenantDisagrees } : {}),
      ...(data.tenantComments !== undefined ? { tenantComments: data.tenantComments || null } : {}),
      ...(data.keys !== undefined ? { keys: normaliseKeys(data.keys) as unknown as Prisma.InputJsonValue } : {}),
      ...(meterReadings !== undefined ? { meterReadings: meterReadings as unknown as Prisma.InputJsonValue } : {}),
      ...(data.reportType !== undefined ? { reportType: data.reportType } : {}),
      ...(scheduledFor !== undefined ? { scheduledFor } : {}),
      ...(data.assignedToUserId !== undefined ? { assignedToUserId: data.assignedToUserId } : {}),
      ...(data.tenantId !== undefined ? { tenantId: data.tenantId } : {}),
    },
    include: INSPECTION_INCLUDE,
  });

  // Planning changes and keys are worth an audit row; autosaved findings are not.
  const changed: Record<string, unknown> = {};
  for (const f of PLANNING_FIELDS) if (data[f] !== undefined) changed[f] = data[f];
  if (data.keys !== undefined) changed.keys = normaliseKeys(data.keys);
  if (Object.keys(changed).length) {
    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "UPDATE",
      resource: "ConditionReport",
      resourceId: report.id,
      organizationId: report.organizationId,
      before: Object.fromEntries(Object.keys(changed).map((k) => [k, (report as unknown as Record<string, unknown>)[k] ?? null])),
      after: changed,
    });
  }
  if (data.assignedToUserId && data.assignedToUserId !== report.assignedToUserId) {
    await notifyInspectionAssigned(report.id, { id: session!.user.id, name: session!.user.name ?? session!.user.email ?? "A manager" });
  }

  return Response.json(await serializeInspection(updated, session!));
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, error } = await requireManagerWrite();
  if (error) return error;
  const loaded = await loadInspection(params.id);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });
  const report = loaded.report;

  if (report.status === "ACCEPTED" || report.tenantDocumentId) {
    return Response.json({ error: "An accepted report can't be deleted." }, { status: 409 });
  }
  for (const p of report.photos) {
    try { await deleteFromStorage(p.storagePath); } catch { /* best-effort */ }
  }
  if (report.tenantSignaturePath) {
    try { await deleteFromStorage(report.tenantSignaturePath); } catch { /* best-effort */ }
  }
  await prisma.conditionReport.delete({ where: { id: report.id } });
  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "DELETE",
    resource: "ConditionReport",
    resourceId: report.id,
    organizationId: report.organizationId,
    before: { reportType: report.reportType, unitId: report.unitId, tenantId: report.tenantId, status: report.status },
  });
  return Response.json({ ok: true });
}

/** Repair-job links are set by the server only (repair-jobs route) — never taken from the client. */
function withStoredJobIds(items: unknown[], stored: unknown): unknown[] {
  type Link = { id?: string; jobId?: string; pendingAt?: string };
  const linkOf = new Map(((stored as Link[] | null) ?? []).filter((i) => i?.id).map((i) => [i.id!, i]));
  return items.map((raw) => {
    const { jobId: _client, pendingAt: _clientAt, ...item } = raw as Link;
    const s = item.id ? linkOf.get(item.id) : undefined;
    return s?.jobId ? { ...item, jobId: s.jobId, ...(s.pendingAt ? { pendingAt: s.pendingAt } : {}) } : item;
  });
}
