import { getAccessiblePropertyIds, requireManagerWrite } from "@/lib/auth-utils";
import { formatCurrency } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getMonthRange } from "@/lib/date-utils";
import { getActiveTaxConfigs, matchConfig, calcTax, taxLabel } from "@/lib/tax-engine";
import { calcLettingFee, lettingFeeDescription } from "@/lib/letting-fee";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function generateOwnerInvoiceNumber(year: number, month: number, seq: number) {
  const mm = String(month).padStart(2, "0");
  const nn = String(seq).padStart(4, "0");
  return `OWN-${year}${mm}-${nn}`;
}

// Letting fee invoice to the owner. The % (ManagementAgreement.newLettingFeeRate,
// default 50) applies to the tenant's FULL first-month charge — rent + service
// charge + parking (src/lib/letting-fee.ts) — never rent alone.
//
// Two modes:
//   { propertyId, periodYear, periodMonth }            — every tenant whose lease
//     started in the month, one invoice; 409 if the period already has one.
//   { …, tenantId }                                     — one tenant (the
//     Tenants-page prompt after onboarding); 409 only if THAT tenant already
//     has a letting-fee line, so two new tenants in one month get two invoices.
export async function POST(req: Request) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const accessibleIds = await getAccessiblePropertyIds();
  if (!accessibleIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { propertyId, periodYear, periodMonth, tenantId } = body as {
    propertyId: string;
    periodYear: number;
    periodMonth: number;
    tenantId?: string;
  };

  if (!propertyId || !periodYear || !periodMonth) {
    return Response.json({ error: "propertyId, periodYear and periodMonth are required" }, { status: 400 });
  }
  if (!accessibleIds.includes(propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Idempotency
  if (tenantId) {
    const priorInvoices = await prisma.ownerInvoice.findMany({
      where: { propertyId, type: "LETTING_FEE", status: { not: "CANCELLED" } },
      select: { id: true, invoiceNumber: true, lineItems: true },
    });
    const dup = priorInvoices.find((inv) =>
      (Array.isArray(inv.lineItems) ? (inv.lineItems as { refTenantId?: string | null; tenantId?: string | null }[]) : [])
        .some((li) => li.refTenantId === tenantId || li.tenantId === tenantId),
    );
    if (dup) {
      return Response.json(
        { error: `A letting fee for this tenant was already invoiced (${dup.invoiceNumber})`, invoiceId: dup.id },
        { status: 409 },
      );
    }
  } else {
    const existing = await prisma.ownerInvoice.findFirst({
      where: { propertyId, type: "LETTING_FEE", periodYear, periodMonth, status: { not: "CANCELLED" } },
      select: { id: true, invoiceNumber: true },
    });
    if (existing) {
      return Response.json(
        { error: "A letting fee invoice already exists for this period", invoiceId: existing.id },
        { status: 409 }
      );
    }
  }

  const { from: start, to: end } = getMonthRange(periodYear, periodMonth - 1);

  const [property, agreement, newTenants] = await Promise.all([
    prisma.property.findUnique({
      where: { id: propertyId },
      select: { ownerId: true, currency: true, organizationId: true },
    }),
    prisma.managementAgreement.findUnique({
      where: { propertyId },
      select: { newLettingFeeRate: true, mgmtFeeInvoiceDay: true },
    }),
    prisma.tenant.findMany({
      where: tenantId
        ? { id: tenantId, unit: { propertyId } }
        : { unit: { propertyId }, leaseStart: { gte: start, lte: end } },
      select: {
        id: true,
        name: true,
        monthlyRent: true,
        serviceCharge: true,
        parkingFee: true,
        unitId: true,
        unit: { select: { unitNumber: true } },
      },
    }),
  ]);

  if (!property) return Response.json({ error: "Property not found" }, { status: 404 });

  if (newTenants.length === 0) {
    return Response.json(
      tenantId
        ? { error: "Tenant not found on this property" }
        : { error: `No new tenants found with a lease starting in ${MONTH_NAMES[periodMonth - 1]} ${periodYear}` },
      { status: tenantId ? 404 : 400 }
    );
  }

  const currency = property.currency ?? "USD";
  const fmt = (n: number) => formatCurrency(n, currency);
  const rate = agreement?.newLettingFeeRate ?? 50;
  const lineItems = newTenants.map((t) => {
    const fee = calcLettingFee(t, rate);
    return {
      description: `Letting Fee — ${t.name} — Unit ${t.unit.unitNumber} (${lettingFeeDescription(fee, fmt)})`,
      amount: fee.amount,
      unitId: t.unitId,
      // Reference only: the fee is OWNER income. tenantId stays null so paying
      // this invoice never books an income entry against the tenant.
      refTenantId: t.id,
      tenantId: null,
      incomeType: "LETTING_FEE",
    };
  });

  const subtotal = lineItems.reduce((s, i) => s + i.amount, 0);
  let totalAmount = subtotal;

  // Apply tax if an ADDITIVE config covers letting fee income
  const orgId = property.organizationId;
  if (orgId) {
    // Rate as of the billed period's end, so regenerating an old period after
    // a rate change still bills at the rate in force then.
    const taxConfigs = await getActiveTaxConfigs(propertyId, orgId, new Date(periodYear, periodMonth, 0));
    const taxConfig = matchConfig(taxConfigs, "LETTING_FEE_INCOME");
    if (taxConfig && taxConfig.type === "ADDITIVE") {
      const { taxAmount } = calcTax(subtotal, taxConfig);
      (lineItems as unknown[]).push({
        description: taxLabel(taxConfig),
        amount: taxAmount,
        unitId: null,
        tenantId: null,
        incomeType: "OTHER",
        isTaxLine: true,
      });
      totalAmount = subtotal + taxAmount;
    }
  }

  const dueDayOfMonth = agreement?.mgmtFeeInvoiceDay ?? 7;
  const dueDate = new Date(periodYear, periodMonth - 1, dueDayOfMonth);

  const existingCount = await prisma.ownerInvoice.count({ where: { periodYear, periodMonth } });
  const invoiceNumber = generateOwnerInvoiceNumber(periodYear, periodMonth, existingCount + 1);

  const invoice = await prisma.ownerInvoice.create({
    data: {
      invoiceNumber,
      propertyId,
      ownerId:     property.ownerId ?? null,
      type:        "LETTING_FEE",
      periodYear,
      periodMonth,
      lineItems:   lineItems as never,
      totalAmount,
      dueDate,
      status:      "DRAFT",
      ...(tenantId ? { notes: `New tenant: ${newTenants[0].name}` } : {}),
    },
    include: {
      property: { select: { name: true } },
      owner:    { select: { name: true, email: true } },
    },
  });

  await logAudit({
    userId:     session!.user.id,
    userEmail:  session!.user.email,
    action:     "CREATE",
    resource:   "OwnerInvoice",
    resourceId: invoice.id,
    organizationId: session!.user.organizationId,
    after: { invoiceNumber, type: "LETTING_FEE", totalAmount, rate, tenants: newTenants.map((t) => t.name) },
  });

  return Response.json(invoice, { status: 201 });
}
