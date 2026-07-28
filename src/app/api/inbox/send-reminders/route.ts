export const maxDuration = 60;

import { requireManagerWrite, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { sendNotificationEmail, esc } from "@/lib/email";
import { formatCurrency } from "@/lib/currency";
import { format } from "date-fns";

const MAX_BATCH = 50;

const schema = z.object({
  invoiceIds: z.array(z.string().min(1)).min(1).max(MAX_BATCH),
});

const MS_PER_DAY = 86_400_000;

// ── POST /api/inbox/send-reminders ───────────────────────────────────────────
// Emails a real rent-payment reminder to the tenant of each overdue invoice
// (the Inbox bulk action). Every send is logged to the tenant's communication
// trail; tenants without an email address are reported back, not silently
// skipped.
export async function POST(req: Request) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const invoices = await prisma.invoice.findMany({
    where: { id: { in: parsed.data.invoiceIds } },
    select: {
      id: true, invoiceNumber: true, status: true, totalAmount: true, paidAmount: true,
      dueDate: true, periodYear: true, periodMonth: true,
      tenant: {
        select: {
          id: true, name: true, email: true,
          unit: {
            select: {
              unitNumber: true, propertyId: true,
              property: { select: { name: true, currency: true, organizationId: true, organization: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });

  const now = new Date();
  const sent: { invoiceId: string; tenant: string; sentTo: string }[] = [];
  const failed: { invoiceId: string; tenant: string; error: string }[] = [];

  for (const inv of invoices) {
    const t = inv.tenant;
    if (!propertyIds.includes(t.unit.propertyId)) {
      failed.push({ invoiceId: inv.id, tenant: t.name, error: "No access" });
      continue;
    }
    if (inv.status === "PAID" || inv.status === "CANCELLED") {
      failed.push({ invoiceId: inv.id, tenant: t.name, error: `Invoice is ${inv.status.toLowerCase()}` });
      continue;
    }
    const tenantEmail = t.email?.trim();
    if (!tenantEmail) {
      failed.push({ invoiceId: inv.id, tenant: t.name, error: "No email address on tenant profile" });
      continue;
    }

    const currency = t.unit.property.currency ?? "USD";
    const outstanding = inv.totalAmount - (inv.paidAmount ?? 0);
    const daysOverdue = Math.max(0, Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / MS_PER_DAY));
    const periodLabel = format(new Date(inv.periodYear, inv.periodMonth - 1, 1), "MMMM yyyy");
    const propertyName = t.unit.property.name;
    const senderName = t.unit.property.organization?.name ?? propertyName;

    const subject = `Rent payment reminder — ${propertyName}, ${periodLabel}`;
    const html = `
      <p>Dear ${esc(t.name)},</p>
      <p>This is a friendly reminder that your rent for <strong>${esc(periodLabel)}</strong>
      (Unit ${esc(t.unit.unitNumber)}, ${esc(propertyName)}) is still outstanding.</p>
      <table cellpadding="4" style="border-collapse:collapse">
        <tr><td>Invoice No:</td><td><strong>${esc(inv.invoiceNumber)}</strong></td></tr>
        <tr><td>Amount due:</td><td><strong>${esc(formatCurrency(outstanding, currency))}</strong></td></tr>
        <tr><td>Due date:</td><td><strong>${esc(format(new Date(inv.dueDate), "d MMMM yyyy"))}</strong>${daysOverdue > 0 ? ` (${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue)` : ""}</td></tr>
      </table>
      <p>If you have already made this payment, please disregard this message or share your
      proof of payment so we can update our records.</p>
      <p>Kind regards,<br/>${esc(senderName)}</p>
    `;

    try {
      await sendNotificationEmail(tenantEmail, subject, html, {
        organizationId: t.unit.property.organizationId ?? null,
      });
      await prisma.communicationLog.create({
        data: {
          tenantId: t.id,
          type: "EMAIL",
          subject,
          body: `Rent reminder for invoice ${inv.invoiceNumber} (${periodLabel}) emailed to ${tenantEmail} — ${formatCurrency(outstanding, currency)} outstanding, ${daysOverdue} day(s) overdue.`,
          templateUsed: "rent_reminder",
          loggedByEmail: session!.user.email ?? "system",
          loggedByName: session!.user.name ?? null,
          sentAt: new Date(),
        },
      });
      sent.push({ invoiceId: inv.id, tenant: t.name, sentTo: tenantEmail });
    } catch {
      failed.push({ invoiceId: inv.id, tenant: t.name, error: "Email send failed" });
    }
  }

  return Response.json({ sent: sent.length, failed: failed.length, sentDetails: sent, failedDetails: failed });
}
