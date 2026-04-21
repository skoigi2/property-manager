import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { formatCurrency } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getMonthRange } from "@/lib/date-utils";
import { getActiveTaxConfigs, matchConfig, calcTax, taxLabel } from "@/lib/tax-engine";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function generateOwnerInvoiceNumber(year: number, month: number, seq: number) {
  const mm = String(month).padStart(2, "0");
  const nn = String(seq).padStart(4, "0");
  return `OWN-${year}${mm}-${nn}`;
}

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;

  const accessibleIds = await getAccessiblePropertyIds();
  if (!accessibleIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { propertyId, periodYear, periodMonth } = body as {
    propertyId: string;
    periodYear: number;
    periodMonth: number;
  };

  if (!propertyId || !periodYear || !periodMonth) {
    return Response.json({ error: "propertyId, periodYear and periodMonth are required" }, { status: 400 });
  }
  if (!accessibleIds.includes(propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Idempotency — return 409 if already exists
  const existing = await prisma.ownerInvoice.findFirst({
    where: { propertyId, type: "MANAGEMENT_FEE", periodYear, periodMonth },
    select: { id: true, invoiceNumber: true },
  });
  if (existing) {
    return Response.json(
      { error: "A management fee invoice already exists for this period", invoiceId: existing.id },
      { status: 409 }
    );
  }

  const { from: start, to: end } = getMonthRange(periodYear, periodMonth - 1);

  // Fetch everything needed for fee calculation in parallel
  const [property, agreement, activeTenants, feeConfigs, incomeAgg] = await Promise.all([
    prisma.property.findUnique({
      where: { id: propertyId },
      select: { type: true, ownerId: true, currency: true },
    }),
    prisma.managementAgreement.findUnique({
      where: { propertyId },
      select: { mgmtFeeInvoiceDay: true },
    }),
    prisma.tenant.findMany({
      where: { isActive: true, unit: { propertyId } },
      select: { unitId: true, monthlyRent: true, unit: { select: { unitNumber: true } } },
    }),
    prisma.managementFeeConfig.findMany({
      where: {
        unit: { propertyId },
        effectiveFrom: { lte: end },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
      },
    }),
    prisma.incomeEntry.aggregate({
      where: {
        date: { gte: start, lte: end },
        type: { not: "DEPOSIT" },
        unit: { propertyId },
      },
      _sum: { grossAmount: true },
    }),
  ]);

  if (!property) return Response.json({ error: "Property not found" }, { status: 404 });

  const grossIncome = incomeAgg._sum.grossAmount ?? 0;

  const label = `${MONTH_NAMES[periodMonth - 1]} ${periodYear}`;
  const lineItems: { description: string; amount: number; unitId: null; tenantId: null; incomeType: string }[] = [];

  if (property.type === "LONGTERM") {
    for (const t of activeTenants) {
      const cfg = feeConfigs.find((c) => c.unitId === t.unitId);
      if (!cfg) continue;
      const amount = cfg.flatAmount ?? (cfg.ratePercent / 100) * t.monthlyRent;
      const desc = cfg.flatAmount != null
        ? `Unit ${t.unit.unitNumber} — Management Fee (flat)`
        : `Unit ${t.unit.unitNumber} — Management Fee (${cfg.ratePercent}% \u00d7 ${formatCurrency(t.monthlyRent, property!.currency ?? "USD")})`;
      lineItems.push({ description: desc, amount, unitId: null, tenantId: null, incomeType: "OTHER" });
    }
  } else {
    // AIRBNB — 10% of gross income
    const amount = grossIncome * 0.1;
    lineItems.push({
      description: `Management Fee — ${label} (10% \u00d7 ${formatCurrency(grossIncome, property!.currency ?? "USD")} gross income)`,
      amount,
      unitId: null,
      tenantId: null,
      incomeType: "OTHER",
    });
  }

  const mgmtFeeSubtotal = lineItems.reduce((s, i) => s + i.amount, 0);

  if (mgmtFeeSubtotal <= 0) {
    return Response.json(
      { error: "Could not calculate management fee — check that fee configurations are set up for this property" },
      { status: 400 }
    );
  }

  // Apply tax if an ADDITIVE config covers management fee income
  const orgId = (await prisma.property.findUnique({ where: { id: propertyId }, select: { organizationId: true } }))?.organizationId;
  let mgmtFeeOwing = mgmtFeeSubtotal;
  if (orgId) {
    const taxConfigs = await getActiveTaxConfigs(propertyId, orgId);
    const taxConfig = matchConfig(taxConfigs, "MANAGEMENT_FEE_INCOME");
    if (taxConfig && taxConfig.type === "ADDITIVE") {
      const { taxAmount } = calcTax(mgmtFeeSubtotal, taxConfig);
      lineItems.push({
        description: taxLabel(taxConfig),
        amount: taxAmount,
        unitId: null,
        tenantId: null,
        incomeType: "OTHER",
        isTaxLine: true,
      } as any);
      mgmtFeeOwing = mgmtFeeSubtotal + taxAmount;
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
      type:        "MANAGEMENT_FEE",
      periodYear,
      periodMonth,
      lineItems:   lineItems as never,
      totalAmount: mgmtFeeOwing,
      dueDate,
      status:      "DRAFT",
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
    after: { invoiceNumber, type: "MANAGEMENT_FEE", totalAmount: mgmtFeeOwing },
  });

  return Response.json(invoice, { status: 201 });
}
