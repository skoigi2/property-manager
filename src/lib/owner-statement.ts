import { prisma } from "@/lib/prisma";
import { getMonthRange } from "@/lib/date-utils";
import { calcPropertyManagementFee, mgmtFeeBase } from "@/lib/management-fee";
import { resolveExpectedRent } from "@/lib/rent-resolution";
import { scheduledExpectedForMonth } from "@/lib/rent-schedule";
import { format } from "date-fns";

export interface OwnerStatementLine {
  tenantName:    string;
  unit:          string;
  unitType:      string;
  rentExpected:  number;
  rentReceived:  number;
  serviceCharge: number;
  otherIncome:   number;
  /** Metered water / electricity collected — an "of which" of otherIncome. */
  utilities:     number;
  grossTotal:    number;
}

/**
 * MEMO block: where the metered water / electricity money went. Every figure
 * here is ALREADY inside grossIncome (utility recovery) or expenses (council,
 * KPLC, generator) — it re-presents them, it is never a second deduction.
 */
export interface OwnerStatementUtilities {
  waterCollected:       number;
  electricityCollected: number;
  /** Utility recovery recorded without saying which utility. */
  otherCollected:       number;
  waterCost:            number;
  electricityCost:      number;
  generatorCost:        number;
  /** collected − costs: the borehole / power surplus that goes to the owner. */
  surplus:              number;
}

export interface OwnerStatementPayout {
  id:        string;
  amount:    number;
  paidAt:    string;
  method:    string | null;
  reference: string | null;
}

export interface OwnerStatement {
  propertyId:    string;
  propertyName:  string;
  propertyType:  string;
  period:        string;
  generatedAt:   string;
  lines:         OwnerStatementLine[];
  grossIncome:   number;
  managementFee: number;
  expenses:      { category: string; description: string; amount: number }[];
  totalExpenses: number;
  netPayable:    number;
  /** Remittances recorded against this statement period (OwnerPayout rows). */
  payouts:       OwnerStatementPayout[];
  totalPaidOut:  number;
  /** Null when the period has no utility recovery and no utility cost. */
  utilities:     OwnerStatementUtilities | null;
  notes:         string;
  ownerName:     string | null;
  ownerEmail:    string | null;
  currency:      string;
}

/**
 * Builds per-property owner statements for a month. Shared by the
 * /api/report/owner-statement route (owner /report page) and the
 * OWNER_MONTHLY_REPORT cron automation (PDF email attachment).
 */
export async function buildOwnerStatements(
  targetPropertyIds: string[],
  year: number,
  month: number,
): Promise<OwnerStatement[]> {
  const { from, to } = getMonthRange(year, month);
  const periodLabel  = format(from, "MMMM yyyy");

  const properties = await prisma.property.findMany({
    where: { id: { in: targetPropertyIds } },
    include: { units: true, owner: { select: { name: true, email: true } } },
  });

  const [tenants, incomeEntries, expenseEntries, agreements, feeConfigs, payoutRows] = await Promise.all([
    prisma.tenant.findMany({
      // Tenancy overlaps the statement month — vacated tenants stay visible
      // on statements for months they lived through (same fix as the reports).
      where: {
        unit: { propertyId: { in: targetPropertyIds } },
        leaseStart: { lte: to },
        OR: [
          { isActive: true },
          { vacatedDate: { gte: from } },
          { isActive: false, vacatedDate: null, leaseEnd: { gte: from } },
        ],
      },
      include: {
        unit: true,
        rentHistory: { select: { monthlyRent: true, effectiveDate: true } },
      },
    }),
    prisma.incomeEntry.findMany({
      where: { unit: { propertyId: { in: targetPropertyIds } }, date: { gte: from, lte: to } },
      include: { unit: true },
    }),
    prisma.expenseEntry.findMany({
      where: {
        OR: [
          { propertyId: { in: targetPropertyIds } },
          { unit: { propertyId: { in: targetPropertyIds } } },
        ],
        date: { gte: from, lte: to },
        isSunkCost: false,
      },
      include: { unit: { select: { unitNumber: true } } },
    }),
    prisma.managementAgreement.findMany({
      where: { propertyId: { in: targetPropertyIds } },
      select: { propertyId: true, managementFeeRate: true },
    }),
    prisma.managementFeeConfig.findMany({
      where: {
        unit: { propertyId: { in: targetPropertyIds } },
        effectiveFrom: { lte: to },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
      },
      select: { unitId: true, flatAmount: true, ratePercent: true },
    }),
    prisma.ownerPayout.findMany({
      where: { propertyId: { in: targetPropertyIds }, periodYear: year, periodMonth: month },
      orderBy: { paidAt: "asc" },
    }),
  ]);

  return properties.map((property) => {
    const propTenants = tenants.filter(t => t.unit.propertyId === property.id);
    const propIncome  = incomeEntries.filter(e => e.unit.propertyId === property.id);
    const propExpenses = expenseEntries.filter(e =>
      e.propertyId === property.id || (e.unitId && property.units.some(u => u.id === e.unitId))
    );

    // Per-tenant lines
    const lines: OwnerStatementLine[] = propTenants.map(tenant => {
      const tenantIncome = propIncome.filter(e => e.tenantId === tenant.id);
      const rentReceived = tenantIncome.filter(e => e.type === "LONGTERM_RENT").reduce((s,e) => s + e.grossAmount, 0);
      const svcReceived  = tenantIncome.filter(e => e.type === "SERVICE_CHARGE").reduce((s,e) => s + e.grossAmount, 0);
      const otherIncome  = tenantIncome.filter(e => !["LONGTERM_RENT","SERVICE_CHARGE","DEPOSIT"].includes(e.type)).reduce((s,e) => s + e.grossAmount, 0);
      const utilities    = tenantIncome.filter(e => e.type === "UTILITY_RECOVERY").reduce((s,e) => s + e.grossAmount, 0);
      return {
        tenantName:    tenant.isActive ? tenant.name : `${tenant.name} (vacated)`,
        unit:          tenant.unit.unitNumber,
        unitType:      tenant.unit.type,
        // Rent that applied in the STATEMENT month (statements are often
        // generated for past periods), resolved from RentHistory and the
        // tenant's payment schedule — quarterly/biannual/annual payers owe
        // the full period amount on billing months and 0 in between.
        rentExpected:  scheduledExpectedForMonth({
          leaseStart: tenant.leaseStart,
          frequency: tenant.paymentFrequency,
          month: from,
          rentForMonth: (m) => resolveExpectedRent(tenant.rentHistory, tenant.monthlyRent, m),
        }).amount,
        rentReceived,
        serviceCharge: svcReceived,
        otherIncome,
        utilities,
        grossTotal:    rentReceived + svcReceived + otherIncome,
      };
    });

    // For AIRBNB, add unit-level lines without tenant
    if (property.type === "AIRBNB") {
      property.units.forEach(unit => {
        const unitIncome = propIncome.filter(e => e.unitId === unit.id);
        if (unitIncome.length === 0) return;
        const gross = unitIncome.filter(e => e.type !== "DEPOSIT").reduce((s,e) => s + e.grossAmount, 0);
        const commissions = unitIncome.reduce((s,e) => s + e.agentCommission, 0);
        lines.push({
          tenantName:    `Unit ${unit.unitNumber} (Airbnb)`,
          unit:          unit.unitNumber,
          unitType:      unit.type,
          rentExpected:  0,
          rentReceived:  gross - commissions,
          serviceCharge: 0,
          otherIncome:   0,
          utilities:     0,
          grossTotal:    gross - commissions,
        });
      });
    }

    const grossIncome = lines.reduce((s, l) => s + l.grossTotal, 0);

    // Management fee — derived from real configuration only (per-unit
    // ManagementFeeConfig, then property-level rate/flat, then the agreement
    // rate). A property with no fee arrangement shows NO fee.
    const propUnitIds = new Set(property.units.map(u => u.id));
    // One tenant per unit — mid-month turnover must not charge the per-unit
    // fee twice (active tenant wins over the vacated one).
    const feeTenants = Array.from(
      new Map(
        [...propTenants]
          .sort((a, b) => Number(a.isActive) - Number(b.isActive))
          .map(t => [t.unitId, t] as const),
      ).values(),
    );
    const managementFee = calcPropertyManagementFee({
      tenants: feeTenants.map(t => ({ unitId: t.unitId, monthlyRent: t.monthlyRent })),
      feeConfigs: feeConfigs.filter(c => propUnitIds.has(c.unitId)),
      propertyRatePercent: property.managementFeeRate,
      propertyFlatAmount: property.managementFeeFlat,
      agreementRatePercent: agreements.find(a => a.propertyId === property.id)?.managementFeeRate,
      grossIncome: mgmtFeeBase(propIncome),
    });

    // Expenses (exclude management fee from P&L — already deducted above)
    const expenses = propExpenses
      .filter(e => e.category !== "MANAGEMENT_FEE")
      .map(e => ({
        category:    e.category,
        description: e.description ?? e.category,
        amount:      e.amount,
      }));
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const netPayable    = grossIncome - managementFee - totalExpenses;

    // Utilities memo — re-presents figures already counted above.
    const utilIncome = propIncome.filter(e => e.type === "UTILITY_RECOVERY");
    const sumBy = (rows: { grossAmount: number }[]) => rows.reduce((s, e) => s + e.grossAmount, 0);
    const costOf = (category: string) => propExpenses.filter(e => e.category === category).reduce((s, e) => s + e.amount, 0);
    const utilCollected = sumBy(utilIncome);
    const utilCost = costOf("WATER") + costOf("ELECTRICITY") + costOf("GENERATOR");
    const utilities: OwnerStatementUtilities | null = utilCollected > 0 || utilCost > 0
      ? {
          waterCollected:       sumBy(utilIncome.filter(e => e.utilityType === "WATER")),
          electricityCollected: sumBy(utilIncome.filter(e => e.utilityType === "ELECTRICITY")),
          otherCollected:       sumBy(utilIncome.filter(e => !e.utilityType)),
          waterCost:            costOf("WATER"),
          electricityCost:      costOf("ELECTRICITY"),
          generatorCost:        costOf("GENERATOR"),
          surplus:              utilCollected - utilCost,
        }
      : null;

    const payouts = payoutRows
      .filter(p => p.propertyId === property.id)
      .map(p => ({
        id:        p.id,
        amount:    p.amount,
        paidAt:    format(p.paidAt, "d MMM yyyy"),
        method:    p.method,
        reference: p.reference,
      }));
    const totalPaidOut = payouts.reduce((s, p) => s + p.amount, 0);

    return {
      propertyId:   property.id,
      propertyName: property.name,
      propertyType: property.type,
      period:       periodLabel,
      generatedAt:  format(new Date(), "d MMM yyyy, HH:mm"),
      lines,
      grossIncome,
      managementFee,
      expenses,
      totalExpenses,
      netPayable,
      payouts,
      totalPaidOut,
      utilities,
      notes:      `Net payable to owner for ${periodLabel}. Management fee deducted per agreement.`,
      ownerName:  property.owner?.name  ?? null,
      ownerEmail: property.owner?.email ?? null,
      currency:   property.currency ?? "USD",
    };
  });
}
