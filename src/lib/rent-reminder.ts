import { prisma } from "@/lib/prisma";
import { sendNotificationEmail, esc } from "@/lib/email";
import { formatCurrency } from "@/lib/currency";
import { format } from "date-fns";

/**
 * Shared tenant rent-reminder email. Used by the Inbox "Send reminders" bulk
 * action (manual, always "outstanding" wording) and the TENANT_RENT_REMINDERS
 * dunning automation (cron; stage-aware wording). Every send writes a
 * CommunicationLog row so the reminder shows on the tenant's Comms tab.
 */

export type ReminderStage = "UPCOMING" | "DUE" | "OVERDUE";

export interface RentReminderInvoice {
  id: string;
  invoiceNumber: string;
  totalAmount: number;
  paidAmount: number | null;
  dueDate: Date;
  periodYear: number;
  periodMonth: number;
  tenant: {
    id: string;
    name: string;
    email: string | null;
    unit: {
      unitNumber: string;
      property: {
        name: string;
        currency: string | null;
        organizationId: string | null;
        organization: { name: string } | null;
      };
    };
  };
}

const MS_PER_DAY = 86_400_000;

export function buildRentReminderEmail(inv: RentReminderInvoice, stage: ReminderStage, now = new Date()) {
  const t = inv.tenant;
  const currency = t.unit.property.currency ?? "USD";
  const outstanding = inv.totalAmount - (inv.paidAmount ?? 0);
  const daysOverdue = Math.max(0, Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / MS_PER_DAY));
  const daysUntilDue = Math.max(0, Math.ceil((new Date(inv.dueDate).getTime() - now.getTime()) / MS_PER_DAY));
  const periodLabel = format(new Date(inv.periodYear, inv.periodMonth - 1, 1), "MMMM yyyy");
  const propertyName = t.unit.property.name;
  const senderName = t.unit.property.organization?.name ?? propertyName;
  const dueDateLabel = format(new Date(inv.dueDate), "d MMMM yyyy");

  const subject =
    stage === "UPCOMING"
      ? `Rent due ${dueDateLabel} — ${propertyName}, ${periodLabel}`
      : stage === "DUE"
        ? `Rent due today — ${propertyName}, ${periodLabel}`
        : `Rent payment reminder — ${propertyName}, ${periodLabel}`;

  const lead =
    stage === "UPCOMING"
      ? `This is a friendly reminder that your rent for <strong>${esc(periodLabel)}</strong>
         (Unit ${esc(t.unit.unitNumber)}, ${esc(propertyName)}) is due in ${daysUntilDue} day${daysUntilDue !== 1 ? "s" : ""}, on <strong>${esc(dueDateLabel)}</strong>.`
      : stage === "DUE"
        ? `This is a friendly reminder that your rent for <strong>${esc(periodLabel)}</strong>
           (Unit ${esc(t.unit.unitNumber)}, ${esc(propertyName)}) is due <strong>today</strong>.`
        : `This is a friendly reminder that your rent for <strong>${esc(periodLabel)}</strong>
           (Unit ${esc(t.unit.unitNumber)}, ${esc(propertyName)}) is still outstanding.`;

  const html = `
    <p>Dear ${esc(t.name)},</p>
    <p>${lead}</p>
    <table cellpadding="4" style="border-collapse:collapse">
      <tr><td>Invoice No:</td><td><strong>${esc(inv.invoiceNumber)}</strong></td></tr>
      <tr><td>Amount due:</td><td><strong>${esc(formatCurrency(outstanding, currency))}</strong></td></tr>
      <tr><td>Due date:</td><td><strong>${esc(dueDateLabel)}</strong>${daysOverdue > 0 ? ` (${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue)` : ""}</td></tr>
    </table>
    <p>If you have already made this payment, please disregard this message or share your
    proof of payment so we can update our records.</p>
    <p>Kind regards,<br/>${esc(senderName)}</p>
  `;

  return { subject, html, outstanding, currency, daysOverdue, periodLabel };
}

/**
 * Sends the reminder to the tenant and logs it to the communication trail.
 * Throws when the tenant has no email or the send fails — callers decide how
 * to report that (the Inbox action surfaces it; the cron counts it skipped).
 */
export async function sendRentReminderToTenant(
  inv: RentReminderInvoice,
  stage: ReminderStage,
  loggedBy: { email: string; name?: string | null },
  now = new Date(),
): Promise<{ subject: string; sentTo: string }> {
  const tenantEmail = inv.tenant.email?.trim();
  if (!tenantEmail) throw new Error("No email address on tenant profile");

  const { subject, html, outstanding, currency, daysOverdue, periodLabel } =
    buildRentReminderEmail(inv, stage, now);

  await sendNotificationEmail(tenantEmail, subject, html, {
    organizationId: inv.tenant.unit.property.organizationId ?? null,
  });

  await prisma.communicationLog.create({
    data: {
      tenantId: inv.tenant.id,
      type: "EMAIL",
      subject,
      body:
        stage === "OVERDUE"
          ? `Rent reminder for invoice ${inv.invoiceNumber} (${periodLabel}) emailed to ${tenantEmail} — ${formatCurrency(outstanding, currency)} outstanding, ${daysOverdue} day(s) overdue.`
          : `Rent ${stage === "DUE" ? "due-today" : "upcoming-due"} reminder for invoice ${inv.invoiceNumber} (${periodLabel}) emailed to ${tenantEmail} — ${formatCurrency(outstanding, currency)} due.`,
      templateUsed: "rent_reminder",
      loggedByEmail: loggedBy.email,
      loggedByName: loggedBy.name ?? null,
      sentAt: now,
    },
  });

  return { subject, sentTo: tenantEmail };
}
