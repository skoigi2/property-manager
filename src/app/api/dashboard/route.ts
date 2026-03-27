import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getMonthRange, daysUntilExpiry, getLeaseStatus } from "@/lib/date-utils";
import { calcUnitSummary, calcPettyCashTotal } from "@/lib/calculations";
import { getDaysInMonth } from "date-fns";

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

  // Optional: filter to a single property
  const propertyIdParam = searchParams.get("propertyId");
  const propertyIds =
    propertyIdParam && accessibleIds.includes(propertyIdParam)
      ? [propertyIdParam]
      : accessibleIds;

  const { from, to } = getMonthRange(year, month);

  const [properties, tenants, incomeEntries, expenseEntries, pettyCash] = await Promise.all([
    prisma.property.findMany({
      where: { id: { in: propertyIds } },
      include: { units: true },
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
          { propertyId: { in: propertyIds } },
          { unit: { propertyId: { in: propertyIds } } },
        ],
      },
      include: { unit: true, property: true },
    }),
    prisma.pettyCash.findMany({
      where: {
        OR: [
          { propertyId: { in: propertyIds } },
          { propertyId: null },
        ],
      },
    }),
  ]);

  // KPIs
  const totalGrossIncome = incomeEntries.reduce((s, e) => s + e.grossAmount, 0);
  const totalCommissions = incomeEntries.reduce((s, e) => s + e.agentCommission, 0);
  const totalExpenses = expenseEntries.filter((e) => !e.isSunkCost).reduce((s, e) => s + e.amount, 0);
  const netProfit = totalGrossIncome - totalCommissions - totalExpenses;
  const pettyCashBalance = calcPettyCashTotal(pettyCash);

  // Lease alerts
  const leaseAlerts = tenants
    .map((t) => {
      const status = getLeaseStatus(t.leaseEnd);
      const days   = daysUntilExpiry(t.leaseEnd);
      return {
        tenantId:    t.id,
        tenantName:  t.name,
        unitNumber:  t.unit.unitNumber,
        propertyName: t.unit.property.name,
        leaseEnd:    t.leaseEnd,
        days,
        status,
      };
    })
    .filter((a) => a.status !== "OK");

  // Long-term properties
  const longtermProperties = properties.filter((p) => p.type === "LONGTERM");
  const longtermPropertyIds = new Set(longtermProperties.map((p) => p.id));

  // No-rent alerts per long-term tenant
  const longtermTenants = tenants.filter((t) => longtermPropertyIds.has(t.unit.propertyId));
  const longtermIncomeUnitIds = new Set(
    incomeEntries.filter((e) => e.type === "LONGTERM_RENT").map((e) => e.unitId)
  );
  const noRentAlerts = longtermTenants
    .filter((t) => !longtermIncomeUnitIds.has(t.unitId))
    .map((t) => ({
      tenantId:    t.id,
      tenantName:  t.name,
      unitNumber:  t.unit.unitNumber,
      propertyName: t.unit.property.name,
    }));

  // Multi-month arrears — fetch last 12 months of LONGTERM_RENT entries
  const arrearsCutoff = new Date(year, month - 13, 1);
  const allRentEntries = await prisma.incomeEntry.findMany({
    where: {
      type:   "LONGTERM_RENT",
      unit:   { propertyId: { in: propertyIds } },
      date:   { gte: arrearsCutoff },
    },
    select: { unitId: true, tenantId: true, grossAmount: true, date: true },
  });

  const arrearsAlerts = longtermTenants
    .map((t) => {
      if (!t.leaseStart) return null;
      const leaseStart = new Date(t.leaseStart);
      const today      = new Date();
      const start      = new Date(leaseStart.getFullYear(), leaseStart.getMonth(), 1);
      const end        = new Date(today.getFullYear(), today.getMonth(), 1);

      const tenantEntries = allRentEntries.filter(
        (e) => e.tenantId === t.id || e.unitId === t.unitId,
      );

      let totalArrears  = 0;
      let monthsUnpaid  = 0;
      let cursor        = new Date(start);

      while (cursor <= end) {
        const yr = cursor.getFullYear();
        const mo = cursor.getMonth();
        const paid = tenantEntries
          .filter((e) => {
            const d = new Date(e.date);
            return d.getFullYear() === yr && d.getMonth() === mo;
          })
          .reduce((s, e) => s + e.grossAmount, 0);

        const expected = t.monthlyRent ?? 0;
        if (paid < expected * 0.99) {
          totalArrears += Math.max(0, expected - paid);
          monthsUnpaid++;
        }
        cursor = new Date(yr, mo + 1, 1);
      }

      if (monthsUnpaid <= 1) return null; // single-month covered by noRentAlerts
      return {
        tenantId:    t.id,
        tenantName:  t.name,
        unitNumber:  t.unit.unitNumber,
        propertyName: t.unit.property.name,
        monthsUnpaid,
        totalArrears,
      };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

  // Airbnb properties
  const airbnbProperties = properties.filter((p) => p.type === "AIRBNB");
  const airbnbPropertyIds = new Set(airbnbProperties.map((p) => p.id));

  // Alba-style: units with expenses but no income
  const airbnbExpenseUnitIds = new Set(
    expenseEntries
      .filter((e) => e.unitId && e.unit?.propertyId && airbnbPropertyIds.has(e.unit.propertyId))
      .map((e) => e.unitId)
      .filter((id): id is string => id !== null)
  );
  const airbnbIncomeUnitIds = new Set(
    incomeEntries
      .filter((e) => e.type === "AIRBNB")
      .map((e) => e.unitId)
  );
  const noIncomeAlerts = Array.from(airbnbExpenseUnitIds)
    .filter((uid) => !airbnbIncomeUnitIds.has(uid))
    .map((uid) => {
      const unit = airbnbProperties.flatMap((p) => p.units).find((u) => u.id === uid);
      return { unitNumber: unit?.unitNumber ?? uid };
    });

  // Rent status per long-term property
  const rentStatus = longtermTenants.map((t) => {
    const unitIncome = incomeEntries.filter(
      (e) => e.unitId === t.unitId && e.type === "LONGTERM_RENT"
    );
    const received = unitIncome.reduce((s, e) => s + e.grossAmount, 0);
    const expected = t.monthlyRent + t.serviceCharge;
    return {
      id: t.id,
      tenantName: t.name,
      unitNumber: t.unit.unitNumber,
      propertyId: t.unit.propertyId,
      propertyName: t.unit.property.name,
      type: t.unit.type,
      expectedRent: t.monthlyRent,
      serviceCharge: t.serviceCharge,
      expected,
      received,
      variance: received - expected,
      leaseEnd: t.leaseEnd,
      leaseStatus: getLeaseStatus(t.leaseEnd),
    };
  });

  // Airbnb revenue per unit
  const daysInMonth = getDaysInMonth(from);
  const airbnbRevenue = airbnbProperties.flatMap((prop) =>
    prop.units.map((unit) => {
      const unitIncome = incomeEntries.filter((e) => e.unitId === unit.id);
      const unitExpenses = expenseEntries.filter((e) => e.unitId === unit.id);
      const summary = calcUnitSummary(unitIncome, unitExpenses);
      const bookedNights = unitIncome.reduce((s, e) => {
        if (e.checkIn && e.checkOut) {
          return s + Math.round(
            (new Date(e.checkOut).getTime() - new Date(e.checkIn).getTime()) / 86400000
          );
        }
        return s;
      }, 0);
      return {
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        propertyId: prop.id,
        propertyName: prop.name,
        type: unit.type,
        status: unit.status,
        ...summary,
        bookedNights,
        daysInMonth,
      };
    })
  );

  // 6-month trend
  const trendMonths = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(year, month - 1 - i, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }).reverse();

  const trendFrom = getMonthRange(trendMonths[0].year, trendMonths[0].month).from;
  const trendTo   = getMonthRange(trendMonths[trendMonths.length - 1].year, trendMonths[trendMonths.length - 1].month).to;

  const [trendIncome, trendExpenses] = await Promise.all([
    prisma.incomeEntry.findMany({
      where: { date: { gte: trendFrom, lte: trendTo }, unit: { propertyId: { in: propertyIds } } },
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

  const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const trend = trendMonths.map(({ year: y, month: m }) => {
    const { from: f, to: t } = getMonthRange(y, m);
    const monthIncome   = trendIncome.filter(e => e.date >= f && e.date <= t);
    const monthExpenses = trendExpenses.filter(e => e.date >= f && e.date <= t);
    const gross    = monthIncome.reduce((s, e) => s + e.grossAmount, 0);
    const comm     = monthIncome.reduce((s, e) => s + e.agentCommission, 0);
    const expenses = monthExpenses.reduce((s, e) => s + e.amount, 0);
    return { label: `${MONTH_LABELS[m - 1]} ${y}`, gross, net: gross - comm - expenses };
  });

  // Expense summary by category
  const expenseSummary = expenseEntries
    .filter((e) => !e.isSunkCost)
    .reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + e.amount;
      return acc;
    }, {});

  // Operational summaries (maintenance, arrears, invoices, renewals, vacancies)
  const [openJobs, activeCases, invoiceStats, activeRenewals, vacantUnitCount] = await Promise.all([
    prisma.maintenanceJob.findMany({
      where: { propertyId: { in: propertyIds }, status: { in: ["OPEN", "IN_PROGRESS", "AWAITING_PARTS"] } },
      select: { priority: true },
    }),
    prisma.arrearsCase.findMany({
      where: { propertyId: { in: propertyIds }, stage: { not: "RESOLVED" } },
      select: { stage: true, amountOwed: true },
    }),
    prisma.invoice.aggregate({
      where: { tenant: { unit: { propertyId: { in: propertyIds } } }, status: { in: ["SENT", "OVERDUE"] } },
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
  ]);

  const maintenanceSummary = {
    urgent: openJobs.filter((j) => j.priority === "URGENT").length,
    high:   openJobs.filter((j) => j.priority === "HIGH").length,
    open:   openJobs.length,
  };
  const arrearsSummary = {
    openCases: activeCases.length,
    totalOwed: activeCases.reduce((s, c) => s + c.amountOwed, 0),
    escalated: activeCases.filter((c) => c.stage === "LEGAL_NOTICE" || c.stage === "EVICTION").length,
  };
  const invoiceSummary = {
    count:  invoiceStats._count.id,
    amount: invoiceStats._sum.totalAmount ?? 0,
  };

  // Management fee reconciliation — use DB configs
  const feeConfigs = await prisma.managementFeeConfig.findMany({
    where: {
      unit: { propertyId: { in: propertyIds } },
      effectiveFrom: { lte: to },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
    },
  });

  const mgmtFeeOwing =
    longtermTenants.reduce((s, t) => {
      const cfg = feeConfigs.find((c) => c.unitId === t.unitId);
      if (!cfg) return s;
      return s + (cfg.flatAmount ?? (cfg.ratePercent / 100) * t.monthlyRent);
    }, 0) +
    airbnbRevenue.reduce((s, u) => s + u.grossIncome * 0.1, 0);

  const mgmtFeePaid = expenseEntries
    .filter((e) => e.category === "MANAGEMENT_FEE")
    .reduce((s, e) => s + e.amount, 0);

  return Response.json({
    period: { year, month },
    properties: properties.map((p) => ({ id: p.id, name: p.name, type: p.type })),
    kpis: {
      totalGrossIncome,
      totalCommissions,
      totalExpenses,
      netProfit,
      pettyCashBalance,
    },
    alerts: {
      leaseAlerts,
      noRentAlerts,
      noIncomeAlerts,
      arrearsAlerts,
      pettyCashDeficit: pettyCashBalance < 0,
    },
    rentStatus,
    airbnbRevenue,
    expenseSummary,
    mgmtFeeReconciliation: {
      owing: mgmtFeeOwing,
      paid: mgmtFeePaid,
      balance: mgmtFeePaid - mgmtFeeOwing,
    },
    trend,
    maintenanceSummary,
    arrearsSummary,
    invoiceSummary,
    renewalPipeline: activeRenewals,
    vacantUnits: vacantUnitCount,
  });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[dashboard] 500:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
