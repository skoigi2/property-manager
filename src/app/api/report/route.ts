import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getMonthRange, getLeaseStatus, formatDate } from "@/lib/date-utils";
import { calcUnitSummary, calcPettyCashTotal, RIARA_MGMT_FEE } from "@/lib/calculations";
import { generateReportPDF } from "@/lib/pdf-generator";
import { format, getDaysInMonth } from "date-fns";
import type { ReportData } from "@/types/report";

// ── Shared data builder ────────────────────────────────────────────────────────

async function buildReportData(y: number, m: number, session: any): Promise<ReportData> {
  const { from, to } = getMonthRange(y, m);
  const periodLabel = format(from, "MMMM yyyy");

  const [properties, tenants, incomeEntries, expenseEntries, pettyCash] = await Promise.all([
    prisma.property.findMany({ include: { units: true } }),
    prisma.tenant.findMany({
      where: { isActive: true },
      include: { unit: { include: { property: true } } },
    }),
    prisma.incomeEntry.findMany({
      where: { date: { gte: from, lte: to } },
      include: { unit: { include: { property: true } } },
    }),
    prisma.expenseEntry.findMany({
      where: { date: { gte: from, lte: to } },
    }),
    prisma.pettyCash.findMany({ orderBy: { date: "asc" } }),
  ]);

  const grossIncome       = incomeEntries.filter((e) => e.type !== "DEPOSIT").reduce((s, e) => s + e.grossAmount, 0);
  const agentCommissions  = incomeEntries.reduce((s, e) => s + e.agentCommission, 0);
  const totalExpenses     = expenseEntries.filter((e) => !e.isSunkCost).reduce((s, e) => s + e.amount, 0);
  const netProfit         = grossIncome - agentCommissions - totalExpenses;

  const riaraProperty = properties.find((p) => p.type === "LONGTERM");
  const albaProperty  = properties.find((p) => p.type === "AIRBNB");
  const riaraTenants  = tenants.filter((t) => t.unit.propertyId === riaraProperty?.id);

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
  const albaPerformance = (albaProperty?.units ?? []).map((unit) => {
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
    (albaProperty?.units ?? []).reduce((s, unit) => {
      const unitIncome = incomeEntries.filter((e) => e.unitId === unit.id);
      return s + unitIncome.reduce((sum, e) => sum + e.grossAmount, 0) * 0.1;
    }, 0);
  const mgmtPaid = expenseEntries
    .filter((e) => e.category === "MANAGEMENT_FEE")
    .reduce((s, e) => s + e.amount, 0);

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
  if (calcPettyCashTotal(pettyCash) < 0)
    alerts.push(`Petty cash deficit: KSh ${Math.abs(calcPettyCashTotal(pettyCash)).toLocaleString()}`);
  if (mgmtOwing > mgmtPaid)
    alerts.push(`Management fee outstanding: KSh ${(mgmtOwing - mgmtPaid).toLocaleString()}`);

  return {
    title:       `${riaraProperty?.name ?? "Property"} & ${albaProperty?.name ?? "Property"} — ${periodLabel}`,
    property:    "Alba Gardens & Riara One",
    period:      periodLabel,
    generatedAt: format(new Date(), "d MMM yyyy, HH:mm"),
    generatedBy: session?.user?.name ?? session?.user?.email ?? "Manager",
    kpis:        { grossIncome, agentCommissions, totalExpenses, netProfit },
    rentCollection,
    albaPerformance,
    expenses,
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
  };
}

// ── GET — JSON preview data (single month or full year) ───────────────────────

export async function GET(req: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year  = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()));
  const month = searchParams.get("month");

  if (month) {
    // Single month — return full ReportData as JSON
    const data = await buildReportData(year, parseInt(month), session);
    return Response.json(data);
  } else {
    // Annual — return array of 12 monthly summaries (kpis only, fast)
    const months = await Promise.all(
      Array.from({ length: 12 }, async (_, i) => {
        const m = i + 1;
        const { from, to } = getMonthRange(year, m);
        const [income, expenses] = await Promise.all([
          prisma.incomeEntry.findMany({
            where: { unit: { propertyId: { in: propertyIds } }, date: { gte: from, lte: to } },
          }),
          prisma.expenseEntry.findMany({
            where: {
              OR: [
                { unit: { propertyId: { in: propertyIds } } },
                { propertyId: { in: propertyIds } },
              ],
              date: { gte: from, lte: to },
            },
          }),
        ]);
        const grossIncome      = income.filter((e) => e.type !== "DEPOSIT").reduce((s, e) => s + e.grossAmount, 0);
        const agentCommissions = income.reduce((s, e) => s + e.agentCommission, 0);
        const totalExpenses    = expenses.filter((e) => !e.isSunkCost).reduce((s, e) => s + e.amount, 0);
        return {
          month:  m,
          label:  format(from, "MMM"),
          grossIncome,
          agentCommissions,
          totalExpenses,
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

  const body        = await req.json();
  const y           = parseInt(body.year);
  const m           = parseInt(body.month);
  const reportData  = await buildReportData(y, m, session);
  const pdfBuffer   = await generateReportPDF(reportData);

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="property-report-${y}-${String(m).padStart(2, "0")}.pdf"`,
    },
  });
}
