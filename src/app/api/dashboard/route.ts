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
    // 12-month rolling window for the arrears calc
    const arrearsCutoff = new Date(year, month - 13, 1);

    // ── ONE round-trip: all 7 queries fan out in parallel ───────────────────
    // (was 11 queries across 3 round-trips — arrears + feeConfigs ran serially)
    const [
      properties,
      tenants,
      incomeEntries,
      expenseEntries,
      pettyCash,
      allRentEntries,
      feeConfigs,
    ] = await Promise.all([
      prisma.property.findMany({
        where: { id: { in: propertyIds } },
        include: { units: true },
      }),
      // Slim tenant select — no more nested unit→property include.
      // Property name is resolved later via the propertyById map.
      prisma.tenant.findMany({
        where: { isActive: true, unit: { propertyId: { in: propertyIds } } },
        select: {
          id: true,
          name: true,
          leaseStart: true,
          leaseEnd: true,
          monthlyRent: true,
          serviceCharge: true,
          unitId: true,
          unit: { select: { id: true, unitNumber: true, propertyId: true, type: true } },
        },
      }),
      // Income entries — drop the nested property include too. Filtering /
      // aggregating only ever needs unitId, type, grossAmount, dates.
      prisma.incomeEntry.findMany({
        where: { date: { gte: from, lte: to }, unit: { propertyId: { in: propertyIds } } },
        select: {
          id: true,
          unitId: true,
          tenantId: true,
          type: true,
          grossAmount: true,
          agentCommission: true,
          checkIn: true,
          checkOut: true,
          platform: true,
        },
      }),
      // Expense entries — keep only the field we need from unit (propertyId
      // for the unit→property mapping in the no-income alert).
      prisma.expenseEntry.findMany({
        where: {
          date: { gte: from, lte: to },
          OR: [
            { propertyId: { in: propertyIds } },
            { unit: { propertyId: { in: propertyIds } } },
          ],
        },
        select: {
          id: true,
          unitId: true,
          propertyId: true,
          category: true,
          amount: true,
          isSunkCost: true,
          unit: { select: { propertyId: true } },
        },
      }),
      prisma.pettyCash.findMany({
        where: {
          OR: [
            { propertyId: { in: propertyIds } },
            { propertyId: null },
          ],
        },
      }),
      // Arrears: 12-month rolling rent log (was serial — now parallel)
      prisma.incomeEntry.findMany({
        where: {
          type: "LONGTERM_RENT",
          unit: { propertyId: { in: propertyIds } },
          date: { gte: arrearsCutoff },
        },
        select: { unitId: true, tenantId: true, grossAmount: true, date: true },
      }),
      // Management-fee configs (was serial — now parallel)
      prisma.managementFeeConfig.findMany({
        where: {
          unit: { propertyId: { in: propertyIds } },
          effectiveFrom: { lte: to },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
        },
      }),
    ]);

    // Build a unit→property lookup map once so the JS that follows doesn't
    // walk nested objects that no longer exist.
    const propertyById = new Map(properties.map((p) => [p.id, p]));

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
          propertyName: propertyById.get(t.unit.propertyId)?.name ?? "",
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
        propertyName: propertyById.get(t.unit.propertyId)?.name ?? "",
      }));

    // Multi-month arrears — JS reduction over the rolling-window query above
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
          propertyName: propertyById.get(t.unit.propertyId)?.name ?? "",
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
        propertyName: propertyById.get(t.unit.propertyId)?.name ?? "",
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

    // Expense summary by category
    const expenseSummary = expenseEntries
      .filter((e) => !e.isSunkCost)
      .reduce<Record<string, number>>((acc, e) => {
        acc[e.category] = (acc[e.category] ?? 0) + e.amount;
        return acc;
      }, {});

    // Management fee reconciliation — feeConfigs already loaded above
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
      // Server timestamp — the PWA serves this response StaleWhileRevalidate
      // (5 min), so the UI shows when the numbers were actually computed.
      generatedAt: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[dashboard] 500:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
