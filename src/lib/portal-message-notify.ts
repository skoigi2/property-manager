import { prisma } from "@/lib/prisma";
import { esc, sendNotificationEmail } from "@/lib/email";
import { getPropertyManagers } from "@/lib/notifications/checkers";
import { isAutomationEnabled, resetAutomationCache, wantsEmail } from "@/lib/automation-registry";
import { tenantMessageHref } from "@/lib/portal-message-inbox";

const CATEGORY_LABEL: Record<string, string> = {
  LEASE_QUERY: "Lease query",
  PAYMENT_NOTIFICATION: "Payment notification",
  PERMISSION_REQUEST: "Permission request",
  GENERAL: "General",
};

/**
 * "A tenant wrote through the portal" → the property's managers (a new thread
 * or a reply). Recipients come from getPropertyManagers — org admins +
 * managers with access, falling back to the organisation's contact email so
 * a message never goes unnoticed; gated by the NOTIFY_TENANT_MESSAGE
 * automation (org / property) and each recipient's NOTIFICATION opt-out.
 * The email links straight to the conversation. Fire-and-forget: never throws.
 * The Inbox shows the thread regardless of this toggle (it's computed).
 */
export async function notifyTenantMessage(threadId: string, kind: "new" | "reply", body: string): Promise<void> {
  try {
    const thread = await prisma.portalMessageThread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        subject: true,
        category: true,
        tenant: {
          select: {
            id: true,
            name: true,
            unit: { select: { unitNumber: true, property: { select: { id: true, name: true, organizationId: true } } } },
          },
        },
      },
    });
    if (!thread) return;
    const property = thread.tenant.unit.property;
    const orgId = property.organizationId;
    if (!orgId) return;
    resetAutomationCache(); // a request on a warm instance must not see a stale toggle
    if (!(await isAutomationEnabled(orgId, "NOTIFY_TENANT_MESSAGE", property.id))) return;

    const managers = await getPropertyManagers(property.id, orgId);
    if (managers.length === 0) return;

    const appUrl = process.env.NEXTAUTH_URL ?? "https://groundworkpm.com";
    const link = `${appUrl}${tenantMessageHref(thread.tenant.id, thread.id)}`;
    const subject =
      kind === "new"
        ? `New tenant message — ${thread.tenant.name}: ${thread.subject}`
        : `New tenant reply — ${thread.tenant.name}: ${thread.subject}`;
    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a2e">
        <h2 style="margin:0 0 8px 0;font-size:20px">${kind === "new" ? "New message from a tenant" : "A tenant replied"}</h2>
        <p style="color:#6b7280;font-size:13px;margin-top:0">
          <strong>${esc(thread.tenant.name)}</strong> · ${esc(property.name)} · Unit ${esc(thread.tenant.unit.unitNumber)}
        </p>
        <p style="color:#374151;font-size:14px;margin:12px 0">
          ${kind === "new" ? `<strong>Category:</strong> ${esc(CATEGORY_LABEL[thread.category] ?? thread.category)}<br/>` : ""}
          <strong>Subject:</strong> ${esc(thread.subject)}
        </p>
        <pre style="background:#f3f4f6;padding:12px;border-radius:6px;font-family:sans-serif;font-size:13px;white-space:pre-wrap;color:#1a1a2e">${esc(body)}</pre>
        <p style="margin-top:20px">
          <a href="${esc(link)}" style="display:inline-block;background:#C69C4A;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">Open conversation</a>
        </p>
        <p style="margin-top:12px;color:#6b7280;font-size:12px">It is also in your Inbox until someone replies or marks it resolved.</p>
      </div>
    `;

    for (const m of managers) {
      if (!(await wantsEmail(m.userId, "NOTIFICATION"))) continue;
      try {
        await sendNotificationEmail(m.email, subject, html, { organizationId: orgId, userId: m.userId });
      } catch {
        /* one bad address must not block the rest */
      }
    }
  } catch (e) {
    console.error("[portal-msg] notifyTenantMessage failed:", e);
  }
}

/**
 * A manager answered a tenant's portal message → email the tenant (they
 * otherwise only see it by reopening the portal), with the reply and a link
 * back to their portal when the link is still valid. Tenant audience, gated by
 * the NOTIFY_TENANT_PORTAL_REPLY automation; skipped for a tenant without an
 * email. Logged on the tenant's Comms tab. Fire-and-forget: never throws.
 */
export async function notifyTenantOfReply(
  threadId: string,
  reply: string,
  by: { email: string | null | undefined; name: string | null | undefined },
): Promise<void> {
  try {
    const thread = await prisma.portalMessageThread.findUnique({
      where: { id: threadId },
      select: {
        subject: true,
        tenant: {
          select: {
            id: true, name: true, email: true, portalToken: true, portalTokenExpiresAt: true,
            unit: { select: { property: { select: { id: true, name: true, organizationId: true, organization: { select: { name: true } } } } } },
          },
        },
      },
    });
    const tenant = thread?.tenant;
    if (!thread || !tenant?.email) return;
    const property = tenant.unit.property;
    resetAutomationCache();
    if (!(await isAutomationEnabled(property.organizationId, "NOTIFY_TENANT_PORTAL_REPLY", property.id))) return;

    const appUrl = process.env.NEXTAUTH_URL ?? "https://groundworkpm.com";
    const portalLive = !!tenant.portalToken && (!tenant.portalTokenExpiresAt || tenant.portalTokenExpiresAt > new Date());
    const portalUrl = portalLive ? `${appUrl}/portal/${tenant.portalToken}` : null;
    const sender = property.organization?.name ?? property.name;
    const firstName = tenant.name.trim().split(/\s+/)[0] || tenant.name;
    const subject = `Reply from ${sender}: ${thread.subject}`;
    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a2e">
        <p style="font-size:15px;margin:0 0 12px">Hi ${esc(firstName)},</p>
        <p style="color:#374151;font-size:14px;margin:0 0 12px">${esc(sender)} replied to your message <strong>${esc(thread.subject)}</strong>:</p>
        <pre style="background:#f3f4f6;padding:12px;border-radius:6px;font-family:sans-serif;font-size:14px;white-space:pre-wrap;color:#1a1a2e">${esc(reply)}</pre>
        ${
          portalUrl
            ? `<p style="margin-top:20px"><a href="${esc(portalUrl)}" style="display:inline-block;background:#C69C4A;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">Open your tenant portal</a></p>
               <p style="margin-top:8px;color:#6b7280;font-size:12px">Reply from the Messages tab in your portal.</p>`
            : ""
        }
      </div>
    `;
    await sendNotificationEmail(tenant.email, subject, html, { organizationId: property.organizationId });
    await prisma.communicationLog.create({
      data: {
        tenantId: tenant.id,
        type: "EMAIL",
        subject,
        body: reply.slice(0, 5000),
        templateUsed: "portal_reply",
        loggedByEmail: by.email ?? "system",
        loggedByName: by.name ?? null,
        sentAt: new Date(),
      },
    });
  } catch (e) {
    console.error("[portal-msg] notifyTenantOfReply failed:", e);
  }
}
