import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getMonthRange } from "@/lib/date-utils";
import { RIARA_MGMT_FEE } from "@/lib/calculations";
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
}

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year       = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()));
  const month      = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));
  const propertyId = searchParams.get("propertyId");

  const { from, to } = getMonthRange(year, month);
  const periodLabel  = format(from, "MMMM yyyy");

  const targetPropertyIds = propertyId && propertyIds.includes(propertyId)
    ? [propertyId]
    : propertyIds;

  const properties = await prisma.property.findMany({
    where: { id: { in: targetPropertyIds } },
    include: { units: true, owner: { select: { name: true, email: true } } },
  });

  const [tenants, incomeEntries, expenseEntries] = await Promise.all([
    prisma.tenant.findMany({
      where: { unit: { propertyId: { in: targetPropertyIds } }, isActive: true },
      include: { unit: true },
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
  ]);

  const statements: OwnerStatement[] = properties.map((property) => {
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
        rentExpected:  tenant.monthlyRent,
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

    // Management fee
    let managementFee = 0;
    if (property.type === "LONGTERM") {
      managementFee = propTenants.reduce((s, t) => s + (RIARA_MGMT_FEE[t.unit.type] ?? 0), 0);
    } else {
      const airbnbGross = propIncome.filter(e => e.type !== "DEPOSIT").reduce((s,e) => s + e.grossAmount, 0);
      managementFee = airbnbGross * 0.1;
    }

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
    };
  });

  return Response.json(statements);
}
