import { requireOpsStaffWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { inspectionActionSchema } from "@/lib/validations";
import { loadInspection, serializeInspection, isInspectionManager, INSPECTION_INCLUDE } from "@/lib/inspections";
import { decideInspectionAction } from "@/lib/inspection-rules";
import { notifyInspectionUpdate, notifyInspectionEditRequested } from "@/lib/inspection-notify";

// Review actions on a handed-in inspection. Who may do what is decided by
// decideInspectionAction (src/lib/inspection-rules.ts): clearing keys,
// sending back and deciding a correction are manager-only.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, error } = await requireOpsStaffWrite();
  if (error) return error;
  const loaded = await loadInspection(params.id);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });
  const report = loaded.report;

  const parsed = inspectionActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Unknown action" }, { status: 400 });
  const { action } = parsed.data;
  const note = parsed.data.note?.trim() || null;

  const decision = decideInspectionAction(action, report, { isManager: isInspectionManager(session!) }, note);
  if (!decision.ok) return Response.json({ error: decision.error }, { status: decision.status });

  const now = new Date();
  let data: Prisma.ConditionReportUpdateInput;
  switch (action) {
    case "clear_keys":
      data = { keysClearedAt: now, keysClearedByUserId: session!.user.id };
      break;
    case "send_back":
      data = { status: "IN_PROGRESS", reviewNote: note, submittedAt: null };
      break;
    case "request_edit":
      data = { editRequestedAt: now, editRequestedByUserId: session!.user.id, editRequestReason: note };
      break;
    case "approve_edit":
      // Reopen for correction. An accepted report's vaulted PDF stays in the
      // tenant's documents as the earlier version; accepting again vaults a new one.
      data = {
        status: "IN_PROGRESS", acceptedAt: null, acceptedByUserId: null, submittedAt: null, tenantDocumentId: null,
        editRequestedAt: null, editRequestedByUserId: null, editRequestReason: null, reviewNote: note,
      };
      break;
    case "decline_edit":
      data = { editRequestedAt: null, editRequestedByUserId: null, editRequestReason: null, reviewNote: note };
      break;
  }

  const updated = await prisma.conditionReport.update({ where: { id: report.id }, data, include: INSPECTION_INCLUDE });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "ConditionReport",
    resourceId: report.id,
    organizationId: report.organizationId,
    before: { status: report.status, keysClearedAt: report.keysClearedAt, editRequestedAt: report.editRequestedAt },
    after: { action, note, status: updated.status },
  });

  const actor = { id: session!.user.id, name: session!.user.name ?? session!.user.email ?? "A manager" };
  const caretaker = report.submittedByUserId ?? report.assignedToUserId;
  if (action === "clear_keys") await notifyInspectionUpdate(report.id, "keys_cleared", actor, null, report.assignedToUserId ?? report.submittedByUserId);
  if (action === "send_back") await notifyInspectionUpdate(report.id, "sent_back", actor, note, caretaker);
  if (action === "approve_edit") await notifyInspectionUpdate(report.id, "edit_approved", actor, note, report.editRequestedByUserId);
  if (action === "decline_edit") await notifyInspectionUpdate(report.id, "edit_declined", actor, note, report.editRequestedByUserId);
  if (action === "request_edit") await notifyInspectionEditRequested(report.id, actor);

  return Response.json(await serializeInspection(updated, session!));
}
