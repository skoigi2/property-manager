export const maxDuration = 30;

import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getMonthRange, getLeaseStatus, formatDate } from "@/lib/date-utils";
import { calcUnitSummary, calcPettyCashTotal, RIARA_MGMT_FEE } from "@/lib/calculations";
import { generateReportPDF } from "@/lib/pdf-generator";
import { format, getDaysInMonth } from "date-fns";
import type { ReportData } from "@/types/report";
import { formatCurrency } from "@/lib/currency";
import { buildTaxSummary } from "@/lib/tax-engine";

// ── Shared data builder ────────────────────────────────────────────────────────

async function buildReportData(y: number, m: number, session: any, propertyIds: string[]): Promise<ReportData> {
  const { from, to } = getMonthRange(y, m);
  const periodLabel = format(from, "MMMM yyyy");

  const [properties, tenants, incomeEntries, expenseEntries, pettyCash] = await Promise.all([
    prisma.property.findMany({
      where: { id: { in: propertyIds } },
      include: {
        units: true,
        owner:   { select: { name: true, email: true } },
        manager: { select: { name: true, email: true } },
      },
    }),
    prisma.tenant.findMany({
      where: { isActive: true, unit: { propertyId: { in: propertyIds } } },
      include: { unit: { include: { property: true } } },
    }),
    prisma.incomeEntry.findMany({
      where: { date: { gte: from, lte: to }, unit: { propertyId: { in: propertyIds } } },
      include: { unit: { include: { property: true } } },
    }),
    prisma.expenseEntry.findMany({
      where: {
        date: { gte: from, lte: to },
        OR: [
          { unit: { propertyId: { in: propertyIds } } },
          { propertyId: { in: propertyIds } },
        ],
      },
      include: {
        vendor: { select: { id: true, name: true, category: true } },
        lineItems: { select: { taxAmount: true, taxType: true, isVatable: true } },
      },
    }),
    prisma.pettyCash.findMany({ where: { propertyId: { in: propertyIds } }, orderBy: { date: "asc" } }),
  ]);

  const grossIncome       = incomeEntries.filter((e) => e.type !== "DEPOSIT").reduce((s, e) => s + e.grossAmount, 0);
  const agentCommissions  = incomeEntries.reduce((s, e) => s + e.agentCommission, 0);
  const totalExpenses     = expenseEntries.filter((e) => !e.isSunkCost).reduce((s, e) => s + e.amount, 0);
  const netProfit         = grossIncome - agentCommissions - totalExpenses;

  const propertyNames = properties.map((p) => p.name).join(" & ");
  const ownerName     = properties[0]?.owner?.name   ?? properties[0]?.owner?.email   ?? "Owner";
  const managerName   = properties[0]?.manager?.name ?? properties[0]?.manager?.email ?? session?.user?.name ?? "Manager";
  const totalUnits    = properties.reduce((s, p) => s + p.units.length, 0);
  const occupancyRate = totalUnits > 0 ? Math.round((tenants.length / totalUnits) * 100) : 0;

  const longTermIds  = new Set(properties.filter((p) => p.type === "LONGTERM").map((p) => p.id));
  const riaraTenants = tenants.filter((t) => longTermIds.has(t.unit.propertyId));
  const albaUnits    = properties.filter((p) => p.type === "AIRBNB").flatMap((p) => p.units);
  const longTermName = properties.filter((p) => p.type === "LONGTERM").map((p) => p.name).join(" & ") || "Long-Term Rent";
  const shortLetName = properties.filter((p) => p.type === "AIRBNB").map((p) => p.name).join(" & ")  || "Short-Let Performance";

  // Rent collection
  const rentCollection = riaraTenants.map((t) => {
    const unitIncome = incomeEntries.filter((e) => e.unitId === t.unitId && e.type === "LONGTERM_RENT");
    const received   = unitIncome.reduce((s, e) => s + e.grossAmount, 0);
    return {
      tenantName:    t.name,
      unit:          t.unit.unitNumber,
      type:          t.unit.type,
      expectedRent:  t.monthlyRent,
      serviceCharge: t.serviceCharge,
      received,
      variance:      received - (t.monthlyRent + t.serviceCharge),
      status:        getLeaseStatus(t.leaseEnd),
      leaseEnd:      t.leaseEnd ? formatDate(t.leaseEnd) : null,
    };
  });

  // Alba performance
  const daysInMonth    = getDaysInMonth(from);
  const albaPerformance = albaUnits.map((unit) => {
    const unitIncome    = incomeEntries.filter((e) => e.unitId === unit.id);
    const unitExpenses  = expenseEntries.filter((e) => e.unitId === unit.id);
    const summary       = calcUnitSummary(unitIncome, unitExpenses);
    const bookedNights  = unitIncome.reduce((s, e) => {
      if (e.checkIn && e.checkOut) {
        return s + Math.round(
          (new Date(e.checkOut).getTime() - new Date(e.checkIn).getTime()) / 86400000,
        );
      }
      return s;
    }, 0);
    return {
      unitNumber:    unit.unitNumber,
      type:          unit.type,
      grossRevenue:  summary.grossIncome,
      commissions:   summary.totalCommissions,
      fixedCosts:    summary.fixedExpenses,
      variableCosts: summary.variableExpenses,
      netRevenue:    summary.netRevenue,
      bookedNights,
      daysInMonth,
    };
  });

  // Expenses by category
  const expenseMap = expenseEntries.reduce<Record<string, { amount: number; isSunkCost: boolean }>>((acc, e) => {
    if (!acc[e.category]) acc[e.category] = { amount: 0, isSunkCost: e.isSunkCost };
    acc[e.category].amount += e.amount;
    return acc;
  }, {});
  const expenses = Object.entries(expenseMap).map(([category, v]) => ({ category, ...v }));

  // Petty cash
  const pcIn  = pettyCash.filter((e) => e.type === "IN").reduce((s, e) => s + e.amount, 0);
  const pcOut = pettyCash.filter((e) => e.type === "OUT").reduce((s, e) => s + e.amount, 0);

  // Management fee
  const mgmtOwing =
    riaraTenants.reduce((s, t) => s + (RIARA_MGMT_FEE[t.unit.type] ?? 0), 0) +
    albaUnits.reduce((s, unit) => {
      const unitIncome = incomeEntries.filter((e) => e.unitId === unit.id);
      return s + unitIncome.reduce((sum, e) => sum + e.grossAmount, 0) * 0.1;
    }, 0);
  const mgmtPaid = expenseEntries
    .filter((e) => e.category === "MANAGEMENT_FEE")
    .reduce((s, e) => s + e.amount, 0);

  // Vendor spend
  const vendorSpendMap: Record<string, { name: string; category: string; totalSpend: number; expenseCount: number }> = {};
  for (const e of expenseEntries) {
    if (!(e as any).vendor) continue;
    const v = (e as any).vendor;
    if (!vendorSpendMap[v.id]) {
      vendorSpendMap[v.id] = { name: v.name, category: v.category, totalSpend: 0, expenseCount: 0 };
    }
    vendorSpendMap[v.id].totalSpend += e.amount;
    vendorSpendMap[v.id].expenseCount += 1;
  }
  const vendorSpend = Object.entries(vendorSpendMap)
    .map(([vendorId, data]) => ({ vendorId, ...data }))
    .sort((a, b) => b.totalSpend - a.totalSpend);

  // Alerts
  const alerts: string[] = [];
  const leaseAlerts = tenants.filter((t) => {
    const status = getLeaseStatus(t.leaseEnd);
    return status === "WARNING" || status === "CRITICAL" || status === "TBC";
  });
  leaseAlerts.forEach((t) => {
    const status = getLeaseStatus(t.leaseEnd);
    if (status === "TBC")      alerts.push(`${t.name} (${t.unit.unitNumber}): Lease expiry TBC — action required`);
    else if (status === "CRITICAL") alerts.push(`${t.name} (${t.unit.unitNumber}): Lease EXPIRED`);
    else                       alerts.push(`${t.name} (${t.unit.unitNumber}): Lease expiring soon`);
  });
  const _currency1 = properties[0]?.currency ?? "USD";
  if (calcPettyCashTotal(pettyCash) < 0)
    alerts.push(`Petty cash deficit: ${formatCurrency(Math.abs(calcPettyCashTotal(pettyCash)), _currency1)}`);
  if (mgmtOwing > mgmtPaid)
    alerts.push(`Management fee outstanding: ${formatCurrency(mgmtOwing - mgmtPaid, _currency1)}`);

  // Tax summary
  const allLineItems = expenseEntries.flatMap((e) => (e as any).lineItems ?? []);
  const taxSummary = buildTaxSummary(incomeEntries, allLineItems);

  return {
    title:                `${propertyNames} — ${periodLabel}`,
    property:             propertyNames,
    currency:             properties[0]?.currency ?? "USD",
    longTermPropertyName: longTermName,
    shortLetPropertyName: shortLetName,
    ownerName,
    managerName,
    period:      periodLabel,
    generatedAt: format(new Date(), "d MMM yyyy, HH:mm"),
    generatedBy: session?.user?.name ?? session?.user?.email ?? "Manager",
    kpis:        { grossIncome, agentCommissions, totalExpenses, netProfit, occupancyRate },
    rentCollection,
    albaPerformance,
    expenses,
    vendorSpend,
    pettyCash: {
      totalIn:  pcIn,
      totalOut: pcOut,
      balance:  pcIn - pcOut,
      entries:  pettyCash.map((e) => ({
        date: formatDate(e.date), description: e.description, type: e.type, amount: e.amount,
      })),
    },
    mgmtFee: { owing: mgmtOwing, paid: mgmtPaid, balance: mgmtPaid - mgmtOwing },
    alerts,
    ...(taxSummary.hasAnyTax ? { taxSummary } : {}),
  };
}

// ── Quarterly data builder ─────────────────────────────────────────────────────

async function buildQuarterlyReportData(year: number, quarter: number, session: any, propertyIds: string[]): Promise<ReportData> {
  const startMonth    = (quarter - 1) * 3 + 1;
  const from          = new Date(year, startMonth - 1, 1);
  const to            = new Date(year, startMonth - 1 + 3, 1); // exclusive
  const quarterLabel  = `Q${quarter} ${year}`;
  const periodLabel   = `${quarterLabel} Summary`;
  const daysInQuarter = [0, 1, 2].reduce((s, i) => s + getDaysInMonth(new Date(year, startMonth - 1 + i, 1)), 0);

  const [properties, tenants, incomeEntries, expenseEntries, pettyCash] = await Promise.all([
    prisma.property.findMany({
      where: { id: { in: propertyIds } },
      include: {
        units: true,
        owner:   { select: { name: true, email: true } },
        manager: { select: { name: true, email: true } },
      },
    }),
    prisma.tenant.findMany({
      where: { isActive: true, unit: { propertyId: { in: propertyIds } } },
      include: { unit: { include: { property: true } } },
    }),
    prisma.incomeEntry.findMany({
      where: { date: { gte: from, lt: to }, unit: { propertyId: { in: propertyIds } } },
      include: { unit: { include: { property: true } } },
    }),
    prisma.expenseEntry.findMany({
      where: {
        date: { gte: from, lt: to },
        OR: [
          { unit: { propertyId: { in: propertyIds } } },
          { propertyId: { in: propertyIds } },
        ],
      },
      include: { lineItems: { select: { taxAmount: true, taxType: true, isVatable: true } } },
    }),
    prisma.pettyCash.findMany({ where: { propertyId: { in: propertyIds } }, orderBy: { date: "asc" } }),
  ]);

  const grossIncome      = incomeEntries.filter((e) => e.type !== "DEPOSIT").reduce((s, e) => s + e.grossAmount, 0);
  const agentCommissions = incomeEntries.reduce((s, e) => s + e.agentCommission, 0);
  const totalExpenses    = expenseEntries.filter((e) => !e.isSunkCost).reduce((s, e) => s + e.amount, 0);
  const netProfit        = grossIncome - agentCommissions - totalExpenses;

  const propertyNames = properties.map((p) => p.name).join(" & ");
  const ownerName     = properties[0]?.owner?.name   ?? properties[0]?.owner?.email   ?? "Owner";
  const managerName   = properties[0]?.manager?.name ?? properties[0]?.manager?.email ?? session?.user?.name ?? "Manager";
  const totalUnits    = properties.reduce((s, p) => s + p.units.length, 0);
  const occupancyRate = totalUnits > 0 ? Math.round((tenants.length / totalUnits) * 100) : 0;

  const longTermIdsQ  = new Set(properties.filter((p) => p.type === "LONGTERM").map((p) => p.id));
  const riaraTenants  = tenants.filter((t) => longTermIdsQ.has(t.unit.propertyId));
  const albaUnitsQ    = properties.filter((p) => p.type === "AIRBNB").flatMap((p) => p.units);
  const longTermNameQ = properties.filter((p) => p.type === "LONGTERM").map((p) => p.name).join(" & ") || "Long-Term Rent";
  const shortLetNameQ = properties.filter((p) => p.type === "AIRBNB").map((p) => p.name).join(" & ")  || "Short-Let Performance";

  // Rent collection — 3 months expected
  const rentCollection = riaraTenants.map((t) => {
    const unitIncome = incomeEntries.filter((e) => e.unitId === t.unitId && e.type === "LONGTERM_RENT");
    const received   = unitIncome.reduce((s, e) => s + e.grossAmount, 0);
    return {
      tenantName:    t.name,
      unit:          t.unit.unitNumber,
      type:          t.unit.type,
      expectedRent:  t.monthlyRent * 3,
      serviceCharge: t.serviceCharge * 3,
      received,
      variance:      received - (t.monthlyRent * 3 + t.serviceCharge * 3),
      status:        getLeaseStatus(t.leaseEnd),
      leaseEnd:      t.leaseEnd ? formatDate(t.leaseEnd) : null,
    };
  });

  // Alba performance
  const albaPerformance = albaUnitsQ.map((unit) => {
    const unitIncome   = incomeEntries.filter((e) => e.unitId === unit.id);
    const unitExpenses = expenseEntries.filter((e) => e.unitId === unit.id);
    const summary      = calcUnitSummary(unitIncome, unitExpenses);
    const bookedNights = unitIncome.reduce((s, e) => {
      if (e.checkIn && e.checkOut) {
        return s + Math.round((new Date(e.checkOut).getTime() - new Date(e.checkIn).getTime()) / 86400000);
      }
      return s;
    }, 0);
    return {
      unitNumber: unit.unitNumber, type: unit.type,
      grossRevenue: summary.grossIncome, commissions: summary.totalCommissions,
      fixedCosts: summary.fixedExpenses, variableCosts: summary.variableExpenses,
      netRevenue: summary.netRevenue, bookedNights, daysInMonth: daysInQuarter,
    };
  });

  // Expenses by category
  const expenseMap = expenseEntries.reduce<Record<string, { amount: number; isSunkCost: boolean }>>((acc, e) => {
    if (!acc[e.category]) acc[e.category] = { amount: 0, isSunkCost: e.isSunkCost };
    acc[e.category].amount += e.amount;
    return acc;
  }, {});
  const expenses = Object.entries(expenseMap).map(([category, v]) => ({ category, ...v }));

  // Petty cash
  const pcIn  = pettyCash.filter((e) => e.type === "IN").reduce((s, e) => s + e.amount, 0);
  const pcOut = pettyCash.filter((e) => e.type === "OUT").reduce((s, e) => s + e.amount, 0);

  // Management fee — 3 months for Riara flat rate
  const mgmtOwing =
    riaraTenants.reduce((s, t) => s + (RIARA_MGMT_FEE[t.unit.type] ?? 0), 0) * 3 +
    albaUnitsQ.reduce((s, unit) => {
      const unitIncome = incomeEntries.filter((e) => e.unitId === unit.id);
      return s + unitIncome.reduce((sum, e) => sum + e.grossAmount, 0) * 0.1;
    }, 0);
  const mgmtPaid = expenseEntries.filter((e) => e.category === "MANAGEMENT_FEE").reduce((s, e) => s + e.amount, 0);

  // Alerts
  const alerts: string[] = [];
  tenants.filter((t) => ["WARNING","CRITICAL","TBC"].includes(getLeaseStatus(t.leaseEnd))).forEach((t) => {
    const status = getLeaseStatus(t.leaseEnd);
    if (status === "TBC")           alerts.push(`${t.name} (${t.unit.unitNumber}): Lease expiry TBC`);
    else if (status === "CRITICAL") alerts.push(`${t.name} (${t.unit.unitNumber}): Lease EXPIRED`);
    else                            alerts.push(`${t.name} (${t.unit.unitNumber}): Lease expiring soon`);
  });
  const _currency2 = properties[0]?.currency ?? "USD";
  if (calcPettyCashTotal(pettyCash) < 0)
    alerts.push(`Petty cash deficit: ${formatCurrency(Math.abs(calcPettyCashTotal(pettyCash)), _currency2)}`);
  if (mgmtOwing > mgmtPaid)
    alerts.push(`Management fee outstanding: ${formatCurrency(mgmtOwing - mgmtPaid, _currency2)}`);

  const allLineItemsQ = expenseEntries.flatMap((e) => (e as any).lineItems ?? []);
  const taxSummaryQ   = buildTaxSummary(incomeEntries, allLineItemsQ);

  return {
    title:                `${propertyNames} — ${periodLabel}`,
    property:             propertyNames,
    currency:             properties[0]?.currency ?? "USD",
    longTermPropertyName: longTermNameQ,
    shortLetPropertyName: shortLetNameQ,
    ownerName, managerName,
    period:      periodLabel,
    generatedAt: format(new Date(), "d MMM yyyy, HH:mm"),
    generatedBy: session?.user?.name ?? session?.user?.email ?? "Manager",
    kpis:        { grossIncome, agentCommissions, totalExpenses, netProfit, occupancyRate },
    rentCollection, albaPerformance, expenses,
    pettyCash: {
      totalIn: pcIn, totalOut: pcOut, balance: pcIn - pcOut,
      entries: pettyCash.map((e) => ({ date: formatDate(e.date), description: e.description, type: e.type, amount: e.amount })),
    },
    mgmtFee: { owing: mgmtOwing, paid: mgmtPaid, balance: mgmtPaid - mgmtOwing },
    alerts,
    ...(taxSummaryQ.hasAnyTax ? { taxSummary: taxSummaryQ } : {}),
  };
}

// ── GET — JSON preview data (single month or full year) ───────────────────────

export async function GET(req: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year            = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()));
  const month           = searchParams.get("month");
  const filterPropertyId = searchParams.get("propertyId");

  const scopedIds = filterPropertyId && propertyIds.includes(filterPropertyId)
    ? [filterPropertyId]
    : propertyIds;

  if (month) {
    const data = await buildReportData(year, parseInt(month), session, scopedIds);
    return Response.json(data);
  } else {
    const months = await Promise.all(
      Array.from({ length: 12 }, async (_, i) => {
        const m = i + 1;
        const { from, to } = getMonthRange(year, m);
        const [income, expenses] = await Promise.all([
          prisma.incomeEntry.findMany({
            where: { unit: { propertyId: { in: scopedIds } }, date: { gte: from, lte: to } },
          }),
          prisma.expenseEntry.findMany({
            where: {
              OR: [
                { unit: { propertyId: { in: scopedIds } } },
                { propertyId: { in: scopedIds } },
              ],
              date: { gte: from, lte: to },
            },
          }),
        ]);
        const grossIncome      = income.filter((e) => e.type !== "DEPOSIT").reduce((s, e) => s + e.grossAmount, 0);
        const agentCommissions = income.reduce((s, e) => s + e.agentCommission, 0);
        const totalExpenses    = expenses.filter((e) => !e.isSunkCost).reduce((s, e) => s + e.amount, 0);
        return {
          month: m, label: format(from, "MMM"),
          grossIncome, agentCommissions, totalExpenses,
          netProfit: grossIncome - agentCommissions - totalExpenses,
        };
      }),
    );
    return Response.json({ year, months });
  }
}

// ── POST — PDF download ────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body             = await req.json();
  const filterPropertyId = body.propertyId as string | undefined;
  const scopedIds        = filterPropertyId && propertyIds.includes(filterPropertyId)
    ? [filterPropertyId]
    : propertyIds;

  // Quarterly PDF
  if (body.type === "quarterly") {
    const q    = parseInt(body.quarter);
    const y    = parseInt(body.year);
    const data = await buildQuarterlyReportData(y, q, session, scopedIds);
    const buf  = await generateReportPDF(data);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="property-report-Q${q}-${y}.pdf"`,
      },
    });
  }

  // Monthly PDF (existing)
  const y          = parseInt(body.year);
  const m          = parseInt(body.month);
  const reportData = await buildReportData(y, m, session, scopedIds);
  const pdfBuffer  = await generateReportPDF(reportData);

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="property-report-${y}-${String(m).padStart(2, "0")}.pdf"`,
    },
  });
}
