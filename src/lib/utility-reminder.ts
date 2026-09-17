import "server-only";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail, esc } from "@/lib/email";
import { formatCurrency } from "@/lib/currency";
import { periodLabel, type StatementTenantRow } from "@/lib/utility-statement";

/**
 * Water / electricity payment reminder for one tenant, built from their row
 * of the property utility statement. The rent reminder (rent-reminder.ts)
 * speaks of "your rent" and one invoice; this one lists the unpaid water and
 * electricity per invoice. Every send writes a CommunicationLog row.
 */

export function buildUtilityReminderEmail(row: StatementTenantRow, ctx: { propertyName: string; senderName: string; currency: string }) {
  const fmt = (n: number) => formatCurrency(n, ctx.currency);
  const owing = row.invoices.filter((i) => i.water.unpaid + i.electricity.unpaid > 0.005);
  const subject = `Water / electricity payment reminder — ${ctx.propertyName}, Unit ${row.unitNumber}`;
  const lines = owing
    .map(
      (i) => `
      <tr>
        <td>${esc(i.invoiceNumber)}</td>
        <td>${esc(periodLabel(`${i.periodYear}-${String(i.periodMonth).padStart(2, "0")}`))}</td>
        <td align="right">${i.water.unpaid > 0 ? esc(fmt(i.water.unpaid)) : "—"}</td>
        <td align="right">${i.electricity.unpaid > 0 ? esc(fmt(i.electricity.unpaid)) : "—"}</td>
      </tr>`,
    )
    .join("");

  const html = `
    <p>Dear ${esc(row.tenantName)},</p>
    <p>This is a friendly reminder that the following water / electricity charges for
    Unit ${esc(row.unitNumber)}, ${esc(ctx.propertyName)} are still outstanding:</p>
    <table cellpadding="6" style="border-collapse:collapse;font-size:14px">
      <tr style="text-align:left;border-bottom:1px solid #e5e7eb">
        <th>Invoice</th><th>Invoice month</th><th align="right">Water</th><th align="right">Electricity</th>
      </tr>
      ${lines}
    </table>
    <p>Total outstanding: <strong>${esc(fmt(row.totalUnpaid))}</strong></p>
    <p>If you have already made this payment, please disregard this message or share your
    proof of payment so we can update our records.</p>
    <p>Kind regards,<br/>${esc(ctx.senderName)}</p>
  `;
  return { subject, html };
}

/** Throws when the tenant has no email or the send fails — callers report it. */
export async function sendUtilityReminder(
  row: StatementTenantRow,
  ctx: { propertyName: string; senderName: string; currency: string; organizationId: string | null },
  loggedBy: { email: string; name?: string | null },
): Promise<{ sentTo: string }> {
  const email = row.email?.trim();
  if (!email) throw new Error("No email address on tenant profile");
  const { subject, html } = buildUtilityReminderEmail(row, ctx);

  await sendNotificationEmail(email, subject, html, { organizationId: ctx.organizationId });
  await prisma.communicationLog.create({
    data: {
      tenantId: row.tenantId,
      type: "EMAIL",
      subject,
      body: `Water / electricity reminder emailed to ${email} — ${formatCurrency(row.totalUnpaid, ctx.currency)} outstanding across ${row.unpaidInvoices} invoice(s) (water ${formatCurrency(row.water.unpaid, ctx.currency)}, electricity ${formatCurrency(row.electricity.unpaid, ctx.currency)}).`,
      templateUsed: "utility_reminder",
      loggedByEmail: loggedBy.email,
      loggedByName: loggedBy.name ?? null,
      sentAt: new Date(),
    },
  });
  return { sentTo: email };
}
