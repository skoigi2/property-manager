import "server-only";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/email";
import { getPropertyManagers } from "@/lib/notifications/checkers";
import { isAutomationEnabled, wantsEmail } from "@/lib/automation-registry";
import {
  inspectionAssignedTemplate, inspectionSubmittedTemplate, inspectionUpdateTemplate, inspectionEditRequestedTemplate,
} from "@/lib/notifications/email-templates";
import { damagedItems, INSPECTION_TYPE_LABEL, type InspectionItem, type InspectionType } from "@/lib/inspection-rules";

// Inspection alerts, all behind the NOTIFY_INSPECTIONS automation and each
// recipient's NOTIFICATION opt-out. Fire-and-forget: never throws.

async function loadRef(reportId: string) {
  const r = await prisma.conditionReport.findUnique({
    where: { id: reportId },
    select: {
      id: true, reportType: true, scheduledFor: true, propertyId: true, organizationId: true, items: true,
      tenantIssues: true, tenantSignOff: true, tenantDisagrees: true, tenantComments: true, submittedByName: true,
      assignedToUserId: true, editRequestedByUserId: true, editRequestReason: true,
      property: { select: { name: true, organizationId: true } },
      unit: { select: { unitNumber: true } },
      tenant: { select: { name: true } },
    },
  });
  if (!r) return null;
  const orgId = r.organizationId ?? r.property.organizationId;
  if (!orgId || !(await isAutomationEnabled(orgId, "NOTIFY_INSPECTIONS", r.propertyId))) return null;
  return {
    r,
    orgId,
    ref: {
      inspectionId: r.id,
      typeLabel: INSPECTION_TYPE_LABEL[r.reportType as InspectionType],
      propertyName: r.property.name,
      unitRef: r.unit.unitNumber,
      tenantName: r.tenant?.name ?? null,
      scheduledFor: r.scheduledFor ? format(r.scheduledFor, "EEE d MMM yyyy, HH:mm") : null,
    },
  };
}

async function emailUser(userId: string | null, subject: string, html: string, orgId: string) {
  if (!userId) return;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, isActive: true } });
  if (!u?.email || !u.isActive) return;
  if (!(await wantsEmail(userId, "NOTIFICATION"))) return;
  await sendNotificationEmail(u.email, subject, html, { organizationId: orgId, userId }).catch(() => {});
}

async function emailManagers(propertyId: string, orgId: string, subject: string, html: string, skipUserId?: string) {
  const managers = await getPropertyManagers(propertyId, orgId);
  for (const m of managers) {
    if (m.userId && m.userId === skipUserId) continue;
    if (!(await wantsEmail(m.userId, "NOTIFICATION"))) continue;
    try { await sendNotificationEmail(m.email, subject, html, { organizationId: orgId }); } catch { /* keep going */ }
  }
}

/** "An inspection was assigned to you" → the assignee (never when they assigned themselves). */
export async function notifyInspectionAssigned(reportId: string, actor: { id: string; name: string }): Promise<void> {
  try {
    const loaded = await loadRef(reportId);
    if (!loaded || !loaded.r.assignedToUserId || loaded.r.assignedToUserId === actor.id) return;
    const { subject, html } = inspectionAssignedTemplate({ ...loaded.ref, assignedByName: actor.name });
    await emailUser(loaded.r.assignedToUserId, subject, html, loaded.orgId);
  } catch (e) {
    console.error("[inspections] notifyInspectionAssigned failed:", e);
  }
}

/** "Inspection handed in" → the property's managers (not the manager who handed it in). */
export async function notifyInspectionSubmitted(reportId: string, actorId: string): Promise<void> {
  try {
    const loaded = await loadRef(reportId);
    if (!loaded) return;
    const { r } = loaded;
    const damaged = damagedItems((r.items as unknown as InspectionItem[]) ?? []);
    const { subject, html } = inspectionSubmittedTemplate({
      ...loaded.ref,
      submittedByName: r.submittedByName ?? "Someone",
      damaged: damaged.map((i) => ({ room: i.room, feature: i.feature, notes: i.notes })),
      tenantIssues: r.tenantIssues,
      tenantSignOff: r.tenantSignOff,
      tenantDisagrees: r.tenantDisagrees,
      tenantComments: r.tenantComments,
      midTermDamage: r.reportType === "MID_TERM" && damaged.length > 0,
    });
    await emailManagers(r.propertyId, loaded.orgId, subject, html, actorId);
  } catch (e) {
    console.error("[inspections] notifyInspectionSubmitted failed:", e);
  }
}

/** Keys cleared / sent back / correction approved or declined → the caretaker concerned. */
export async function notifyInspectionUpdate(
  reportId: string,
  kind: "keys_cleared" | "sent_back" | "edit_approved" | "edit_declined",
  actor: { id: string; name: string },
  note: string | null,
  recipientUserId: string | null,
): Promise<void> {
  try {
    const loaded = await loadRef(reportId);
    if (!loaded || !recipientUserId || recipientUserId === actor.id) return;
    const { subject, html } = inspectionUpdateTemplate({ ...loaded.ref, kind, byName: actor.name, note });
    await emailUser(recipientUserId, subject, html, loaded.orgId);
  } catch (e) {
    console.error("[inspections] notifyInspectionUpdate failed:", e);
  }
}

/** "A correction was requested" → the property's managers. */
export async function notifyInspectionEditRequested(reportId: string, actor: { id: string; name: string }): Promise<void> {
  try {
    const loaded = await loadRef(reportId);
    if (!loaded) return;
    const { subject, html } = inspectionEditRequestedTemplate({
      ...loaded.ref, requestedByName: actor.name, reason: loaded.r.editRequestReason ?? "",
    });
    await emailManagers(loaded.r.propertyId, loaded.orgId, subject, html, actor.id);
  } catch (e) {
    console.error("[inspections] notifyInspectionEditRequested failed:", e);
  }
}
