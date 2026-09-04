import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/email";
import { getPropertyManagers } from "@/lib/notifications/checkers";
import { complaintRaisedTemplate } from "@/lib/notifications/email-templates";
import { isAutomationEnabled, wantsEmail } from "@/lib/automation-registry";
import { COMPLAINT_CATEGORY_LABEL, type ComplaintCategory } from "@/lib/complaint-rules";

/**
 * "New complaint logged" → the property's managers. Staff audience only
 * (getPropertyManagers never includes caretakers), gated by the
 * NOTIFY_NEW_COMPLAINT automation + each recipient's NOTIFICATION opt-out.
 * Fire-and-forget: never throws.
 */
export async function notifyNewComplaint(complaintId: string): Promise<void> {
  try {
    const c = await prisma.tenantComplaint.findUnique({
      where: { id: complaintId },
      select: {
        id: true, title: true, description: true, category: true, source: true, raisedByName: true,
        propertyId: true, organizationId: true, caseThreadId: true,
        property: { select: { name: true } },
        unit: { select: { unitNumber: true } },
        subjectUnit: { select: { unitNumber: true } },
        tenant: { select: { name: true } },
      },
    });
    if (!c) return;
    if (!(await isAutomationEnabled(c.organizationId, "NOTIFY_NEW_COMPLAINT", c.propertyId))) return;

    const managers = await getPropertyManagers(c.propertyId, c.organizationId);
    if (managers.length === 0) return;

    const { subject, html } = complaintRaisedTemplate({
      complaintId: c.id,
      title: c.title,
      description: c.description,
      categoryLabel: COMPLAINT_CATEGORY_LABEL[c.category as ComplaintCategory] ?? c.category,
      propertyName: c.property.name,
      unitRef: c.subjectUnit?.unitNumber ?? c.unit?.unitNumber ?? null,
      tenantName: c.tenant?.name ?? null,
      raisedByName: c.raisedByName,
      source: c.source,
    });

    for (const mgr of managers) {
      if (!(await wantsEmail(mgr.userId, "NOTIFICATION"))) continue;
      sendNotificationEmail(mgr.email, subject, html, { caseThreadId: c.caseThreadId ?? null }).catch(() => {});
    }
  } catch (e) {
    console.error("[complaints] notifyNewComplaint failed:", e);
  }
}
