import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/email";
import { getPropertyManagers } from "@/lib/notifications/checkers";
import { complaintRaisedTemplate, complaintResolvedTemplate } from "@/lib/notifications/email-templates";
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

    // Sequential on purpose: the timeline dual-write merges same-subject
    // sends into one event, which only works when they don't race.
    for (const mgr of managers) {
      if (!(await wantsEmail(mgr.userId, "NOTIFICATION"))) continue;
      try { await sendNotificationEmail(mgr.email, subject, html, { caseThreadId: c.caseThreadId ?? null }); } catch { /* one bad address must not block the rest */ }
    }
  } catch (e) {
    console.error("[complaints] notifyNewComplaint failed:", e);
  }
}

/**
 * "Your complaint was resolved" → the tenant who raised it through the portal.
 * Tenant audience only (never for STAFF-sourced complaints), gated by the
 * NOTIFY_COMPLAINT_RESOLVED automation — a separate toggle from the staff
 * alert so an org can have one without the other. Fire-and-forget.
 */
export async function notifyComplaintResolved(complaintId: string, resolutionNote: string | null): Promise<void> {
  try {
    const c = await prisma.tenantComplaint.findUnique({
      where: { id: complaintId },
      select: {
        id: true, title: true, source: true, propertyId: true, organizationId: true, caseThreadId: true,
        property: { select: { name: true } },
        tenant: { select: { name: true, email: true, portalToken: true, portalTokenExpiresAt: true } },
      },
    });
    if (!c || c.source !== "PORTAL" || !c.tenant?.email) return;
    if (!(await isAutomationEnabled(c.organizationId, "NOTIFY_COMPLAINT_RESOLVED", c.propertyId))) return;

    const tokenLive = !!c.tenant.portalToken && (!c.tenant.portalTokenExpiresAt || c.tenant.portalTokenExpiresAt > new Date());
    const base = process.env.NEXTAUTH_URL ?? "https://groundworkpm.com";
    const { subject, html } = complaintResolvedTemplate({
      tenantName: c.tenant.name,
      title: c.title,
      propertyName: c.property.name,
      resolutionNote,
      portalUrl: tokenLive ? `${base}/portal/${c.tenant.portalToken}` : null,
    });
    sendNotificationEmail(c.tenant.email, subject, html, { organizationId: c.organizationId, caseThreadId: c.caseThreadId ?? null }).catch(() => {});
  } catch (e) {
    console.error("[complaints] notifyComplaintResolved failed:", e);
  }
}
