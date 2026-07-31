import { prisma } from "@/lib/prisma";
import { getMonthRange } from "@/lib/date-utils";
import { calcPropertyManagementFee } from "@/lib/management-fee";
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
  grossTotal:    number;
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

  const [tenants, incomeEntries, expenseEntries, agreements, feeConfigs] = await Promise.all([
    prisma.tenant.findMany({
      where: { unit: { propertyId: { in: targetPropertyIds } }, isActive: true },
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
      return {
        tenantName:    tenant.name,
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
          grossTotal:    gross - commissions,
        });
      });
    }

    const grossIncome = lines.reduce((s, l) => s + l.grossTotal, 0);

    // Management fee — derived from real configuration only (per-unit
    // ManagementFeeConfig, then property-level rate/flat, then the agreement
    // rate). A property with no fee arrangement shows NO fee.
    const propUnitIds = new Set(property.units.map(u => u.id));
    const managementFee = calcPropertyManagementFee({
      tenants: propTenants.map(t => ({ unitId: t.unitId, monthlyRent: t.monthlyRent })),
      feeConfigs: feeConfigs.filter(c => propUnitIds.has(c.unitId)),
      propertyRatePercent: property.managementFeeRate,
      propertyFlatAmount: property.managementFeeFlat,
      agreementRatePercent: agreements.find(a => a.propertyId === property.id)?.managementFeeRate,
      grossIncome: propIncome.filter(e => e.type !== "DEPOSIT").reduce((s, e) => s + e.grossAmount, 0),
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
      notes:      `Net payable to owner for ${periodLabel}. Management fee deducted per agreement.`,
      ownerName:  property.owner?.name  ?? null,
      ownerEmail: property.owner?.email ?? null,
      currency:   property.currency ?? "USD",
    };
  });
}
