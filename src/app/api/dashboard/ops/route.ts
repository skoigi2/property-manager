import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getMonthRange } from "@/lib/date-utils";

export async function GET(req: Request) {
  try {
    const { error } = await requireAuth();
    if (error) return error;

    const accessibleIds = await getAccessiblePropertyIds();
    if (!accessibleIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const year = parseInt(searchParams.get("year") ?? String(now.getFullYear()));
    const month = parseInt(searchParams.get("month") ?? String(now.getMonth() + 1));

    const propertyIdParam = searchParams.get("propertyId");
    const propertyIds =
      propertyIdParam && accessibleIds.includes(propertyIdParam)
        ? [propertyIdParam]
        : accessibleIds;

    // 6-month trend date range
    const trendMonths = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(year, month - 1 - i, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    }).reverse();

    const trendFrom = getMonthRange(trendMonths[0].year, trendMonths[0].month).from;
    const trendTo = getMonthRange(
      trendMonths[trendMonths.length - 1].year,
      trendMonths[trendMonths.length - 1].month
    ).to;

    const [
      openJobs,
      activeCases,
      invoiceStats,
      activeRenewals,
      vacantUnitCount,
      trendIncome,
      trendExpenses,
    ] = await Promise.all([
      prisma.maintenanceJob.findMany({
        where: {
          propertyId: { in: propertyIds },
          status: { in: ["OPEN", "IN_PROGRESS", "AWAITING_PARTS"] },
        },
        select: { priority: true },
      }),
      prisma.arrearsCase.findMany({
        where: { propertyId: { in: propertyIds }, stage: { not: "RESOLVED" } },
        select: { stage: true, amountOwed: true },
      }),
      prisma.invoice.aggregate({
        where: {
          tenant: { unit: { propertyId: { in: propertyIds } } },
          status: { in: ["SENT", "OVERDUE"] },
        },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      prisma.tenant.count({
        where: {
          unit: { propertyId: { in: propertyIds } },
          isActive: true,
          renewalStage: { in: ["NOTICE_SENT", "TERMS_AGREED"] },
        },
      }),
      prisma.unit.count({
        where: { propertyId: { in: propertyIds }, status: "VACANT" },
      }),
      prisma.incomeEntry.findMany({
        where: {
          date: { gte: trendFrom, lte: trendTo },
          unit: { propertyId: { in: propertyIds } },
        },
        select: { date: true, grossAmount: true, agentCommission: true },
      }),
      prisma.expenseEntry.findMany({
        where: {
          date: { gte: trendFrom, lte: trendTo },
          isSunkCost: false,
          OR: [
            { propertyId: { in: propertyIds } },
            { unit: { propertyId: { in: propertyIds } } },
          ],
        },
        select: { date: true, amount: true },
      }),
    ]);

    const maintenanceSummary = {
      urgent: openJobs.filter((j) => j.priority === "URGENT").length,
      high: openJobs.filter((j) => j.priority === "HIGH").length,
      open: openJobs.length,
    };
    const arrearsSummary = {
      openCases: activeCases.length,
      totalOwed: activeCases.reduce((s, c) => s + c.amountOwed, 0),
      escalated: activeCases.filter(
        (c) => c.stage === "LEGAL_NOTICE" || c.stage === "EVICTION"
      ).length,
    };
    const invoiceSummary = {
      count: invoiceStats._count.id,
      amount: invoiceStats._sum.totalAmount ?? 0,
    };

    const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const trend = trendMonths.map(({ year: y, month: m }) => {
      const { from: f, to: t } = getMonthRange(y, m);
      const monthIncome = trendIncome.filter((e) => e.date >= f && e.date <= t);
      const monthExpenses = trendExpenses.filter((e) => e.date >= f && e.date <= t);
      const gross = monthIncome.reduce((s, e) => s + e.grossAmount, 0);
      const comm = monthIncome.reduce((s, e) => s + e.agentCommission, 0);
      const expenses = monthExpenses.reduce((s, e) => s + e.amount, 0);
      return { label: `${MONTH_LABELS[m - 1]} ${y}`, gross, net: gross - comm - expenses };
    });

    return Response.json({
      maintenanceSummary,
      arrearsSummary,
      invoiceSummary,
      renewalPipeline: activeRenewals,
      vacantUnits: vacantUnitCount,
      trend,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[dashboard/ops] 500:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
