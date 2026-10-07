import { format } from "date-fns";
import { requireManager, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { dialCodeForCurrency, normalizePhoneForWhatsApp } from "@/lib/whatsapp";
import { invoiceReminderFigures, tenantReminderFigures } from "@/lib/rent-reminder-figures";
import type { WhatsAppMessageContext } from "@/lib/whatsapp-messages";

/**
 * GET /api/tenants/[id]/whatsapp?invoiceId= — everything a WhatsApp message
 * to this tenant needs, fetched BEFORE the manager taps send (browsers only
 * open a new tab straight from the tap): the phone normalised for wa.me,
 * the portal token if it is still valid (the client builds the URL from its
 * own origin) and the message context.
 *
 * Rent figures: with `invoiceId`, that invoice — exactly as the Inbox
 * "Send reminders" email figures it; without, every open (SENT / OVERDUE)
 * invoice of the tenant via the same per-invoice maths.
 */
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error } = await requireManager();
  if (error) return error;

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    select: {
      id: true, name: true, phone: true, portalToken: true, portalTokenExpiresAt: true,
      monthlyRent: true, serviceCharge: true, isUnitOwner: true, leaseEnd: true, proposedRent: true, proposedLeaseEnd: true,
      unit: {
        select: {
          unitNumber: true, propertyId: true,
          property: { select: { name: true, currency: true, organization: { select: { name: true } } } },
        },
      },
    },
  });
  if (!tenant) return Response.json({ error: "Tenant not found." }, { status: 404 });
  const access = await requirePropertyAccess(tenant.unit.propertyId);
  if (!access.ok) return access.error!;

  const invoiceId = new URL(req.url).searchParams.get("invoiceId");
  const invoices = await prisma.invoice.findMany({
    where: invoiceId
      ? { id: invoiceId, tenantId: tenant.id }
      : { tenantId: tenant.id, status: { in: ["SENT", "OVERDUE"] } },
    select: { totalAmount: true, paidAmount: true, dueDate: true, periodYear: true, periodMonth: true },
    orderBy: { dueDate: "asc" },
  });
  if (invoiceId && invoices.length === 0) return Response.json({ error: "Invoice not found." }, { status: 404 });

  const figures = invoiceId ? invoiceReminderFigures(invoices[0]) : tenantReminderFigures(invoices);
  const periodLabel =
    invoices.length === 1 ? format(new Date(invoices[0].periodYear, invoices[0].periodMonth - 1, 1), "MMMM yyyy") : null;

  const lastPayment = await prisma.incomeEntry.findFirst({
    where: { tenantId: tenant.id, type: { in: ["LONGTERM_RENT", "SERVICE_CHARGE"] } },
    orderBy: { date: "desc" },
    select: { grossAmount: true, date: true },
  });

  const property = tenant.unit.property;
  const currency = property.currency ?? "USD";
  const dialCode = dialCodeForCurrency(currency);
  const portalValid =
    !!tenant.portalToken && (!tenant.portalTokenExpiresAt || tenant.portalTokenExpiresAt.getTime() > Date.now());

  const context: Omit<WhatsAppMessageContext, "portalUrl"> = {
    tenantName: tenant.name,
    unitNumber: tenant.unit.unitNumber,
    propertyName: property.name,
    currency,
    senderName: property.organization?.name ?? property.name,
    outstanding: figures.outstanding,
    daysOverdue: figures.daysOverdue,
    periodLabel,
    monthlyRent: tenant.monthlyRent,
    serviceCharge: tenant.serviceCharge ?? 0,
    isUnitOwner: tenant.isUnitOwner,
    lastPayment: lastPayment ? { amount: lastPayment.grossAmount, date: lastPayment.date.toISOString() } : null,
    leaseEnd: tenant.leaseEnd?.toISOString() ?? null,
    proposedRent: tenant.proposedRent ?? null,
    proposedLeaseEnd: tenant.proposedLeaseEnd?.toISOString() ?? null,
  };

  return Response.json({
    tenantId: tenant.id,
    invoiceId: invoiceId ?? null,
    phone: { raw: tenant.phone, digits: normalizePhoneForWhatsApp(tenant.phone, dialCode), dialCode },
    portalToken: portalValid ? tenant.portalToken : null,
    context,
  });
}
