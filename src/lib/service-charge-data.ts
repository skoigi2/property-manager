import "server-only";
import { prisma } from "@/lib/prisma";
import {
  budgetVsActual,
  serviceChargeYear,
  suggestedMonthlyCharge,
  unitWeights,
  yearEndStatement,
  type ScInvoice,
  type ScTenancy,
  type ScUnit,
  type ServiceChargeBasisValue,
} from "@/lib/service-charge";

/**
 * Everything the Service Charge page, its PDFs and the portal need for one
 * budget, loaded in one Promise.all: the units and their shares, budget vs
 * actual, and the (interim or year-end) statement.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function loadBudgetRecord(budgetId: string) {
  return prisma.serviceChargeBudget.findUnique({
    where: { id: budgetId },
    include: {
      lines: { orderBy: { category: "asc" } },
      property: { select: { id: true, name: true, currency: true, type: true, organizationId: true } },
    },
  });
}

export type BudgetRecord = NonNullable<Awaited<ReturnType<typeof loadBudgetRecord>>>;

export async function buildServiceChargeView(budget: BudgetRecord, asOf: Date = new Date()) {
  const y = serviceChargeYear(budget.year, budget.startMonth);
  const propertyId = budget.propertyId;
  const categories = budget.lines.map((l) => l.category);

  const [units, tenants, expenses, meters, org] = await Promise.all([
    prisma.unit.findMany({
      where: { propertyId },
      select: {
        id: true,
        unitNumber: true,
        sizeSqm: true,
        tenants: { where: { isActive: true }, select: { id: true, name: true, serviceCharge: true } },
      },
    }),
    prisma.tenant.findMany({
      where: {
        unit: { propertyId },
        leaseStart: { lt: y.to },
        OR: [{ isActive: true }, { vacatedDate: { gte: y.from } }, { vacatedDate: null, leaseEnd: { gte: y.from } }],
      },
      select: {
        id: true,
        name: true,
        email: true,
        unitId: true,
        isActive: true,
        leaseStart: true,
        leaseEnd: true,
        vacatedDate: true,
        invoices: {
          where: {
            OR: [
              { periodYear: { gte: y.from.getFullYear(), lte: y.to.getFullYear() } },
              { serviceChargeBudgetId: budget.id },
            ],
          },
          select: {
            id: true, invoiceNumber: true, tenantId: true, periodYear: true, periodMonth: true, status: true,
            paidAmount: true, serviceChargeBudgetId: true, rentAmount: true, serviceCharge: true, otherCharges: true,
            lateFeeAmount: true, waterAmount: true, electricityAmount: true, wifiAmount: true, depositAmount: true, leaseFee: true,
          },
        },
      },
    }),
    categories.length === 0
      ? Promise.resolve([] as { category: string; amount: number; vatAmount: number | null }[])
      : prisma.expenseEntry.findMany({
          where: {
            propertyId,
            scope: "PROPERTY",
            isSunkCost: false,
            category: { in: categories },
            date: { gte: y.from, lt: y.to },
          },
          select: { category: true, amount: true, vatAmount: true },
        }),
    prisma.utilityMeter.findMany({ where: { propertyId, isActive: true, role: "UNIT" }, select: { utility: true }, distinct: ["utility"] }),
    budget.property.organizationId
      ? prisma.organization.findUnique({ where: { id: budget.property.organizationId }, select: { name: true } })
      : Promise.resolve(null),
  ]);

  const scUnits: ScUnit[] = units
    .map((u) => ({
      id: u.id,
      unitNumber: u.unitNumber,
      sizeSqm: u.sizeSqm,
      currentCharge: u.tenants.reduce((s, t) => s + (t.serviceCharge ?? 0), 0),
    }))
    .sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }));
  const weights = unitWeights(scUnits, budget.basis as ServiceChargeBasisValue);

  const budgetTotal = round2(budget.lines.reduce((s, l) => s + l.amount, 0));
  const unitRows = scUnits.map((u) => {
    const occupant = units.find((x) => x.id === u.id)?.tenants[0] ?? null;
    return {
      unitId: u.id,
      unitNumber: u.unitNumber,
      sizeSqm: u.sizeSqm,
      share: weights.share[u.id] ?? 0,
      budgetShare: round2(budgetTotal * (weights.share[u.id] ?? 0)),
      suggestedMonthly: suggestedMonthlyCharge(budgetTotal, weights.share[u.id] ?? 0),
      tenant: occupant ? { id: occupant.id, name: occupant.name, currentCharge: occupant.serviceCharge } : null,
    };
  });

  const actualByCategory: Record<string, number> = {};
  for (const e of expenses) actualByCategory[e.category] = (actualByCategory[e.category] ?? 0) + e.amount + (e.vatAmount ?? 0);
  const bva = budgetVsActual(
    budget.lines.map((l) => ({ category: l.category, amount: l.amount })),
    actualByCategory,
    y,
    asOf,
  );

  const tenancies: ScTenancy[] = tenants.map((t) => ({
    tenantId: t.id,
    tenantName: t.name,
    email: t.email,
    unitId: t.unitId,
    leaseStart: t.leaseStart,
    endDate: t.vacatedDate ?? (t.isActive ? null : t.leaseEnd),
  }));
  const invoices: ScInvoice[] = tenants.flatMap((t) => t.invoices);
  const statement = yearEndStatement({ year: y, asOf, actualTotal: bva.totals.actual, units: scUnits, weights, tenancies, invoices });

  const warnings = [...weights.warnings];
  for (const m of meters) {
    if (categories.includes(m.utility)) {
      warnings.push(
        `${m.utility === "WATER" ? "Water" : "Electricity"} is budgeted here, but this property has unit meters for it — tenants already pay their own use through metering. Budget only the common-area share, or remove the line.`,
      );
    }
  }
  const billedOnAccount = statement.totals.billed;

  return {
    budget: {
      id: budget.id,
      year: budget.year,
      startMonth: budget.startMonth,
      basis: budget.basis as ServiceChargeBasisValue,
      basisUsed: weights.basisUsed,
      notes: budget.notes,
      publishedAt: budget.publishedAt,
      lines: budget.lines.map((l) => ({ category: l.category, amount: l.amount, notes: l.notes })),
      total: budgetTotal,
    },
    property: { id: budget.property.id, name: budget.property.name, currency: budget.property.currency },
    orgName: org?.name ?? null,
    period: { from: y.from, to: y.to, label: y.label, days: y.days },
    units: unitRows,
    budgetVsActual: bva,
    billedOnAccount,
    statement,
    warnings,
  };
}

export type ServiceChargeView = Awaited<ReturnType<typeof buildServiceChargeView>>;
