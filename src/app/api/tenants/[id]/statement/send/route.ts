import "server-only";
import { requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { loadStatementForManager } from "@/lib/tenant-statement-request";
import { getStatementBranding } from "@/lib/tenant-statement";
import { generateTenantStatementPdf } from "@/lib/tenant-statement-pdf";
import { sendNotificationEmail, esc } from "@/lib/email";
import { formatCurrency } from "@/lib/currency";
import { logAudit } from "@/lib/audit";

export const maxDuration = 30;

/**
 * Emails the statement PDF to the tenant. Period params come in the query
 * string, same as the GET/PDF routes. Refuses to send an empty statement —
 * a blank statement emailed to a paying tenant reads as "we have no record
 * of your rent", which is worse than no email.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { error, session } = await requireManagerWrite();
  if (error) return error;

  const url = new URL(req.url);
  const result = await loadStatementForManager(params.id, url.searchParams);
  if ("error" in result) return result.error;
  if ("noPeriod" in result) return result.noPeriod;

  const { statement, organizationId, tenantEmail, tenantName } = result;

  if (statement.coverage.isEmpty) {
    return Response.json(
      { error: statement.coverage.emptyReason, code: "NO_RECORDS" },
      { status: 422 },
    );
  }
  if (!tenantEmail?.trim()) {
    return Response.json(
      { error: "This tenant has no email address on file. Add one on the tenant record first." },
      { status: 400 },
    );
  }

  const branding = await getStatementBranding(params.id);
  const pdf = await generateTenantStatementPdf(statement, branding);

  const fmt = (n: number) => formatCurrency(n, statement.currency);
  const positionLine =
    statement.summary.position === "ARREARS"
      ? `Balance owing: <strong>${esc(fmt(Math.abs(statement.summary.closingBalance)))}</strong>`
      : statement.summary.position === "CREDIT"
        ? `Balance in your favour: <strong>${esc(fmt(Math.abs(statement.summary.closingBalance)))}</strong>`
        : statement.summary.position === "NOT_STATED"
          ? `Payments recorded this period: <strong>${esc(fmt(statement.summary.totalPaid))}</strong>. No invoices are issued for this tenancy, so this statement records payments only and does not state a balance.`
          : "Your account is settled.";

  const subject = `Statement of account — ${statement.propertyName}, Unit ${statement.unitNumber} (${statement.period.label})`;
  const html = `
    <p>Dear ${esc(tenantName)},</p>
    <p>Please find attached your statement of account for <strong>${esc(statement.period.label)}</strong>
    covering Unit ${esc(statement.unitNumber)}, ${esc(statement.propertyName)}.</p>
    <p>${positionLine}</p>
    ${
      statement.summary.awaitingConfirmation.count > 0
        ? `<p>${statement.summary.awaitingConfirmation.count} payment(s) totalling ${esc(fmt(statement.summary.awaitingConfirmation.total))} are awaiting confirmation by your manager and are not yet reflected in the balance.</p>`
        : ""
    }
    <p>This is a statement of account, not a final reconciliation. If anything looks incorrect or
    incomplete, please reply to this email so the records can be corrected.</p>
  `;

  await sendNotificationEmail(tenantEmail, subject, html, {
    organizationId,
    attachments: [
      {
        filename: `Statement - ${tenantName.replace(/[^\w\- ]+/g, "").trim() || "tenant"} - ${statement.period.label.replace(/[^\w\- ()]+/g, "")}.pdf`,
        content: pdf,
      },
    ],
  });

  await prisma.communicationLog.create({
    data: {
      tenantId: params.id,
      type: "EMAIL",
      subject,
      body:
        statement.summary.position === "NOT_STATED"
          ? `Statement of account emailed (${statement.period.label}). Payments-only record: ${fmt(statement.summary.totalPaid)} received; no balance stated.`
          : `Statement of account emailed (${statement.period.label}). Closing balance: ${fmt(statement.summary.closingBalance)}.`,
      templateUsed: "TENANT_STATEMENT",
      loggedByEmail: session!.user.email ?? "unknown",
      loggedByName: session!.user.name ?? null,
    },
  });

  await logAudit({
    userId: session!.user.id ?? session!.user.email ?? "unknown",
    userEmail: session!.user.email,
    action: "CREATE",
    resource: "TenantStatementEmail",
    resourceId: params.id,
    organizationId,
    after: {
      period: statement.period.label,
      closingBalance: statement.summary.closingBalance,
      sentTo: tenantEmail,
      unattributedForProperty: statement.coverage.unattributedForProperty,
    },
  });

  return Response.json({ ok: true, sentTo: tenantEmail });
}
