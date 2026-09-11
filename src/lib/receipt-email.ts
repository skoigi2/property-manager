import "server-only";

import { prisma } from "@/lib/prisma";
import { generateReceiptPdf } from "@/lib/receipt-pdf";
import { loadPaymentReceipt } from "@/lib/payment-receipt-data";
import { sendNotificationEmail, esc } from "@/lib/email";
import { formatCurrency } from "@/lib/currency";
import { isAutomationEnabled, resetAutomationCache } from "@/lib/automation-registry";
import { format } from "date-fns";

// Shared "email the receipt PDF to the tenant" flow — the counterpart of
// src/lib/invoice-email.ts. Used by the manual "Email receipt" button and by
// the TENANT_PAYMENT_RECEIPTS automation, which fires the moment a payment is
// recorded (mark paid / proof approved / income entry logged). One receipt
// per payment event: the caller passes the id of any entry in the group.

export class ReceiptEmailError extends Error {
  constructor(message: string, public statusCode: number = 400) {
    super(message);
  }
}

export const AUTO_RECEIPT_ACTOR = { loggedByEmail: "system", loggedByName: "Automatic receipt" };

export async function emailPaymentReceipt(
  entryId: string,
  actor: { loggedByEmail: string; loggedByName?: string | null },
): Promise<{ sentTo: string; receiptNumber: string }> {
  const payload = await loadPaymentReceipt(entryId);
  if (!payload) throw new ReceiptEmailError("Not found", 404);

  const tenantEmail = payload.tenant.email?.trim();
  if (!tenantEmail) {
    throw new ReceiptEmailError(
      "This tenant has no email address — add one on the tenant's profile first.",
      400,
    );
  }

  const { data } = payload;
  const pdfBuffer = await generateReceiptPdf(data);
  const currency = data.currency ?? "USD";
  const issuer = data.org?.name ?? payload.propertyName;
  const paidDate = format(new Date(data.paidAt), "d MMMM yyyy");

  const subject = `Receipt ${data.receiptNumber} — ${payload.description}, ${payload.propertyName}`;
  const lineRows = data.lines
    .map((l) => `<tr><td>${esc(l.label)}</td><td style="text-align:right"><strong>${esc(formatCurrency(l.amount, currency))}</strong></td></tr>`)
    .join("");
  const invoiceRows = data.invoice
    ? `<tr><td>Invoice:</td><td>${esc(data.invoice.invoiceNumber)} (${esc(data.invoice.periodLabel)})</td></tr>
       <tr><td>Balance outstanding:</td><td><strong>${esc(formatCurrency(data.invoice.outstanding, currency))}</strong></td></tr>`
    : "";
  const depositRows = data.deposit
    ? `<tr><td>Deposit received to date:</td><td><strong>${esc(formatCurrency(data.deposit.receivedToDate, currency))}</strong> of ${esc(formatCurrency(data.deposit.contractual, currency))}</td></tr>`
    : "";

  const html = `
    <p>Dear ${esc(payload.tenant.name)},</p>
    <p>Thank you — we have received your payment for Unit ${esc(data.tenant.unit.unitNumber)}, ${esc(payload.propertyName)}.
    Your receipt is attached.</p>
    <table cellpadding="4" style="border-collapse:collapse">
      ${lineRows}
      <tr><td>Total received:</td><td style="text-align:right"><strong>${esc(formatCurrency(data.amount, currency))}</strong></td></tr>
      <tr><td>Date received:</td><td>${esc(paidDate)}</td></tr>
      ${invoiceRows}
      ${depositRows}
    </table>
    <p>Kind regards,<br/>${esc(issuer)}</p>
  `;

  await sendNotificationEmail(tenantEmail, subject, html, {
    organizationId: payload.organizationId ?? null,
    attachments: [{ filename: payload.filename, content: pdfBuffer }],
  });

  await prisma.communicationLog.create({
    data: {
      tenantId: payload.tenant.id,
      type: "EMAIL",
      subject,
      body: `Receipt ${data.receiptNumber} (${payload.description}, ${formatCurrency(data.amount, currency)}) emailed to ${tenantEmail} with PDF attached.`,
      templateUsed: "RECEIPT",
      loggedByEmail: actor.loggedByEmail,
      loggedByName: actor.loggedByName ?? null,
      sentAt: new Date(),
    },
  });

  return { sentTo: tenantEmail, receiptNumber: data.receiptNumber };
}

/**
 * Automatic receipt on "payment recorded". Gated by the org/property
 * TENANT_PAYMENT_RECEIPTS toggle; silently skips tenants without an email;
 * never throws (a receipt must not fail the payment that triggered it).
 * Awaited by callers so the PDF + send complete before the response.
 */
export async function maybeAutoEmailReceipt(
  entryId: string | null | undefined,
  organizationId: string | null | undefined,
  propertyId: string | null | undefined,
): Promise<{ sent: boolean; reason?: string }> {
  if (!entryId || !organizationId) return { sent: false, reason: "no-entry-or-org" };
  try {
    // The toggle cache is otherwise cleared only by the cron: a warm instance
    // must not keep sending after the manager switched receipts off.
    resetAutomationCache();
    const on = await isAutomationEnabled(organizationId, "TENANT_PAYMENT_RECEIPTS", propertyId ?? null);
    if (!on) return { sent: false, reason: "disabled" };
    await emailPaymentReceipt(entryId, AUTO_RECEIPT_ACTOR);
    return { sent: true };
  } catch (e) {
    if (e instanceof ReceiptEmailError && e.statusCode === 400) return { sent: false, reason: "no-email" };
    console.error("[receipt] automatic receipt failed", e);
    return { sent: false, reason: "error" };
  }
}
