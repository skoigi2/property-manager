import "server-only";
export const maxDuration = 30; // PDF render + email send

import { requireManagerWrite, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import { buildInvoicePdfPayload } from "@/lib/invoice-pdf-data";
import { sendNotificationEmail, esc } from "@/lib/email";
import { formatCurrency } from "@/lib/currency";
import { format } from "date-fns";

// ── POST /api/invoices/[id]/send ─────────────────────────────────────────────
// Emails the invoice PDF to the tenant, marks a DRAFT invoice as SENT, and
// logs the send in the tenant's communication trail.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await buildInvoicePdfPayload(params.id);
  if (!payload) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(payload.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { invoice, data } = payload;
  const tenantEmail = invoice.tenant.email?.trim();
  if (!tenantEmail) {
    return Response.json(
      { error: "This tenant has no email address — add one on the tenant's profile first." },
      { status: 400 },
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
      loggedByEmail: session!.user.email ?? "system",
      loggedByName: session!.user.name ?? null,
      sentAt: new Date(),
    },
  });

  return Response.json({ ok: true, sentTo: tenantEmail, status: invoice.status === "DRAFT" ? "SENT" : invoice.status });
}
