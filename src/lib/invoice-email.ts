import "server-only";

import { prisma } from "@/lib/prisma";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import { buildInvoicePdfPayload } from "@/lib/invoice-pdf-data";
import { sendNotificationEmail, esc } from "@/lib/email";
import { formatCurrency } from "@/lib/currency";
import { format } from "date-fns";

// Shared "email the invoice PDF to the tenant" flow. Callers do their own auth
// and property-access checks (the cron automation passes system actor values).
// Renders the PDF, emails it, flips DRAFT → SENT once actually sent, and logs
// the send in the tenant's communication trail.

export class InvoiceEmailError extends Error {
  constructor(message: string, public statusCode: number = 400) {
    super(message);
  }
}

export async function emailInvoiceToTenant(
  invoiceId: string,
  actor: { loggedByEmail: string; loggedByName?: string | null },
): Promise<{ sentTo: string; status: string }> {
  const payload = await buildInvoicePdfPayload(invoiceId);
  if (!payload) throw new InvoiceEmailError("Not found", 404);

  const { invoice, data } = payload;
  const tenantEmail = invoice.tenant.email?.trim();
  if (!tenantEmail) {
    throw new InvoiceEmailError(
      "This tenant has no email address — add one on the tenant's profile first.",
      400,
    );
  }

  const pdfBuffer = await generateInvoicePdf(data);

  const currency = data.currency ?? "USD";
  const propertyName = invoice.tenant.unit.property.name;
  const issuerName = data.issuer?.name ?? data.org?.name ?? propertyName;
  const periodLabel = format(new Date(invoice.periodYear, invoice.periodMonth - 1, 1), "MMMM yyyy");
  const dueDate = format(new Date(invoice.dueDate), "d MMMM yyyy");

  const subject = `Invoice ${invoice.invoiceNumber} — ${propertyName}, ${periodLabel}`;
  const html = `
    <p>Dear ${esc(invoice.tenant.name)},</p>
    <p>Please find attached your rent invoice for <strong>${esc(periodLabel)}</strong>
    (Unit ${esc(invoice.tenant.unit.unitNumber)}, ${esc(propertyName)}).</p>
    <table cellpadding="4" style="border-collapse:collapse">
      <tr><td>Invoice No:</td><td><strong>${esc(invoice.invoiceNumber)}</strong></td></tr>
      <tr><td>Amount due:</td><td><strong>${esc(formatCurrency(invoice.totalAmount, currency))}</strong></td></tr>
      <tr><td>Due date:</td><td><strong>${esc(dueDate)}</strong></td></tr>
    </table>
    <p>Payment details are on the attached invoice.</p>
    <p>Kind regards,<br/>${esc(issuerName)}</p>
  `;

  await sendNotificationEmail(tenantEmail, subject, html, {
    organizationId: payload.organizationId ?? null,
    attachments: [{ filename: `${invoice.invoiceNumber}.pdf`, content: pdfBuffer }],
  });

  // DRAFT → SENT once it has actually gone out.
  if (invoice.status === "DRAFT") {
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "SENT" } });
  }

  // Log in the tenant's communication trail.
  await prisma.communicationLog.create({
    data: {
      tenantId: invoice.tenant.id,
      type: "EMAIL",
      subject,
      body: `Invoice ${invoice.invoiceNumber} (${periodLabel}) emailed to ${tenantEmail} with PDF attached.`,
      templateUsed: "INVOICE",
      loggedByEmail: actor.loggedByEmail,
      loggedByName: actor.loggedByName ?? null,
      sentAt: new Date(),
    },
  });

  return { sentTo: tenantEmail, status: invoice.status === "DRAFT" ? "SENT" : invoice.status };
}
