export const maxDuration = 30;

import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getMonthRange, getLeaseStatus, formatDate } from "@/lib/date-utils";
import { calcUnitSummary, calcPettyCashTotal } from "@/lib/calculations";
import { calcPropertyManagementFee } from "@/lib/management-fee";
import { resolveExpectedRent } from "@/lib/rent-resolution";
import { scheduledExpectedForMonth, frequencyMonths } from "@/lib/rent-schedule";
import { generateReportPDF } from "@/lib/pdf-generator";
import { format, getDaysInMonth } from "date-fns";
import type { ReportData } from "@/types/report";
import { formatCurrency } from "@/lib/currency";
import { buildTaxSummary, expenseTaxItems } from "@/lib/tax-engine";
import { buildAgingSnapshot } from "@/lib/arrears-aging";
import { calcDepositPosition } from "@/lib/deposit";

/**
 * One tenant per unit for the management-fee derivation — when a unit's old
 * tenant vacated and a new one moved in inside the report period, the per-unit
 * fee must not be charged twice. Active tenant wins over the vacated one.
 */
function uniqueByUnit<T extends { unitId: string; isActive: boolean }>(tenants: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const t of [...tenants].sort((a, b) => Number(b.isActive) - Number(a.isActive))) {
    if (seen.has(t.unitId)) continue;
    seen.add(t.unitId);
    out.push(t);
  }
  return out;
}

/** Compact aging block for ReportData (top 15 debtors, oldest first).
 *  Always a point-in-time snapshot AS AT generation time — never rebuilt
 *  historically. `periodEnd` lets the renderers say so when the report
 *  period ended before today. */
async function buildReportAging(propertyIds: string[], periodEnd: Date): Promise<ReportData["arrearsAging"]> {
  const aging = await buildAgingSnapshot(propertyIds);
  if (aging.totalCount === 0) return undefined;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    asAt: now.toISOString(),
    periodEndsBeforeAsAt: periodEnd < startOfToday,
    totalOutstanding: aging.totalOutstanding,
    totalCount: aging.totalCount,
    buckets: aging.buckets,
    rows: aging.rows.slice(0, 15).map((r) => ({
      tenantName: r.tenantName,
      unitNumber: r.unitNumber,
      propertyName: r.propertyName,
      outstanding: r.outstanding,
      oldestAgeDays: r.oldestAgeDays,
      invoiceCount: r.invoiceCount,
    })),
  };
}

// ── Vacancy / void-loss analysis ──────────────────────────────────────────────
//
// Per long-term unit: the days of each period month not covered by any tenancy
// (leaseStart → vacatedDate ?? leaseEnd ?? open-ended when active). Lost rent
// is ESTIMATED as (vacantDays / daysInMonth) × unit.monthlyRent per month.
// Units with no tenancy records at all fall back to Unit.vacantSince; with
// neither signal the unit is skipped (unknown ≠ vacant). Airbnb properties are
// excluded — their occupancy is bookings-based, not tenancy-based.

const DAY_MS = 86400000;

async function buildVacancy(
  properties: {
    id: string; type: string; name: string;
    units: { id: string; unitNumber: string; monthlyRent: number | null; vacantSince: Date | null }[];
  }[],
  from: Date,
  toExcl: Date,
): Promise<ReportData["vacancy"]> {
  const units = properties
    .filter((p) => p.type === "LONGTERM")
    .flatMap((p) => p.units.map((u) => ({ ...u, propertyName: p.name })));
  if (units.length === 0) return undefined;

  const tenancies = await prisma.tenant.findMany({
    where: { unitId: { in: units.map((u) => u.id) } },
    select: { unitId: true, leaseStart: true, leaseEnd: true, vacatedDate: true, isActive: true },
  });
  const byUnit = new Map<string, typeof tenancies>();
  for (const t of tenancies) {
    const arr = byUnit.get(t.unitId);
    if (arr) arr.push(t); else byUnit.set(t.unitId, [t]);
  }

  const rows: NonNullable<ReportData["vacancy"]>["rows"] = [];
  for (const unit of units) {
    const uTenancies = byUnit.get(unit.id) ?? [];
    let vacantDays = 0;
    let lostRent = 0;
    for (let mi = 0; ; mi++) {
      const mStart = new Date(from.getFullYear(), from.getMonth() + mi, 1);
      if (mStart >= toExcl) break;
      const mEnd = new Date(from.getFullYear(), from.getMonth() + mi + 1, 1);
      const dim = Math.round((mEnd.getTime() - mStart.getTime()) / DAY_MS);
      let coveredDays: number;
      if (uTenancies.length === 0) {
        if (!unit.vacantSince) { coveredDays = dim; } // no signal — don't guess
        else {
          const vacStart = unit.vacantSince > mStart ? unit.vacantSince : mStart;
          coveredDays = vacStart >= mEnd ? dim
            : Math.max(0, Math.round((vacStart.getTime() - mStart.getTime()) / DAY_MS));
        }
      } else {
        // Union of tenancy intervals clipped to [mStart, mEnd)
        const clipped = uTenancies
          .map((t) => {
            const endRaw = t.vacatedDate ?? t.leaseEnd ?? (t.isActive ? toExcl : t.leaseStart);
            const s = t.leaseStart > mStart ? t.leaseStart : mStart;
            const e = endRaw < mEnd ? endRaw : mEnd;
            return { s: s.getTime(), e: e.getTime() };
          })
          .filter((iv) => iv.e > iv.s)
          .sort((a, b) => a.s - b.s);
        let coveredMs = 0;
        let cursor = -Infinity;
        for (const iv of clipped) {
          const s = Math.max(iv.s, cursor);
          if (iv.e > s) { coveredMs += iv.e - s; cursor = iv.e; }
          else cursor = Math.max(cursor, iv.e);
        }
        coveredDays = Math.min(dim, Math.round(coveredMs / DAY_MS));
      }
      const vd = Math.max(0, dim - coveredDays);
      vacantDays += vd;
      lostRent += (vd / dim) * (unit.monthlyRent ?? 0);
    }
    if (vacantDays > 0) {
      rows.push({
        propertyName: unit.propertyName,
        unitNumber: unit.unitNumber,
        vacantDays,
        estimatedLostRent: Math.round(lostRent * 100) / 100,
      });
    }
  }
  if (rows.length === 0) return undefined;
  rows.sort((a, b) => b.vacantDays - a.vacantDays);
  return {
    rows,
    totalVacantDays: rows.reduce((s, r) => s + r.vacantDays, 0),
    totalEstimatedLostRent: Math.round(rows.reduce((s, r) => s + r.estimatedLostRent, 0) * 100) / 100,
  };
}

// ── Period-over-period comparison ─────────────────────────────────────────────
//
// Lightweight P&L totals for a from/to window (one income + one expense
// query) — used only for the comparison periods, never for the main figures.

async function computePeriodTotals(from: Date, toExcl: Date, propertyIds: string[]) {
  const [income, expenses] = await Promise.all([
    prisma.incomeEntry.findMany({
      where: { date: { gte: from, lt: toExcl }, unit: { propertyId: { in: propertyIds } } },
      select: { type: true, grossAmount: true, agentCommission: true },
    }),
    prisma.expenseEntry.findMany({
      where: {
        date: { gte: from, lt: toExcl },
        OR: [
          { unit: { propertyId: { in: propertyIds } } },
          { propertyId: { in: propertyIds } },
        ],
      },
      select: { amount: true, isSunkCost: true },
    }),
  ]);
  const grossIncome   = income.filter((e) => e.type !== "DEPOSIT").reduce((s, e) => s + e.grossAmount, 0);
  const commissions   = income.reduce((s, e) => s + e.agentCommission, 0);
  const totalExpenses = expenses.filter((e) => !e.isSunkCost).reduce((s, e) => s + e.amount, 0);
  return { grossIncome, totalExpenses, netProfit: grossIncome - commissions - totalExpenses };
}

function deltaPct(current: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((current - prev) / Math.abs(prev)) * 1000) / 10;
}

async function buildComparison(
  current: { grossIncome: number; totalExpenses: number; netProfit: number },
  candidates: { label: string; from: Date; toExcl: Date }[],
  propertyIds: string[],
): Promise<ReportData["comparison"]> {
  const rows: NonNullable<ReportData["comparison"]> = [];
  for (const c of candidates) {
    const totals = await computePeriodTotals(c.from, c.toExcl, propertyIds);
    // Skip comparisons that predate all data — an all-zero period renders as
    // meaningless −100% / +∞ deltas.
    if (totals.grossIncome === 0 && totals.totalExpenses === 0 && totals.netProfit === 0) continue;
    rows.push({
      label: c.label,
      ...totals,
      deltaPct: {
        grossIncome:   deltaPct(current.grossIncome, totals.grossIncome),
        totalExpenses: deltaPct(current.totalExpenses, totals.totalExpenses),
        netProfit:     deltaPct(current.netProfit, totals.netProfit),
      },
    });
  }
  return rows.length > 0 ? rows : undefined;
}

// ── Deposit liability summary ─────────────────────────────────────────────────
//
// Contractual vs actually-received deposits (calcDepositPosition) across the
// tenancies still in occupancy at the period end. Receipts are ALL-TIME
// DEPOSIT income entries — a deposit taken before the period is still held.

async function buildDepositSummary(
  tenants: {
    id: string; depositAmount: number; leaseStart: Date; leaseEnd: Date | null;
    vacatedDate: Date | null; isActive: boolean;
  }[],
  periodEnd: Date,
): Promise<ReportData["depositSummary"]> {
  const holding = tenants.filter((t) => {
    if (t.leaseStart > periodEnd) return false;
    if (t.isActive) return true;
    const end = t.vacatedDate ?? t.leaseEnd;
    return end != null && end >= periodEnd;
  });
  if (holding.length === 0) return undefined;

  const entries = await prisma.incomeEntry.findMany({
    where: { type: "DEPOSIT", tenantId: { in: holding.map((t) => t.id) } },
    select: { tenantId: true, grossAmount: true },
  });
  const byTenant = new Map<string, { grossAmount: number }[]>();
  for (const e of entries) {
    if (!e.tenantId) continue;
    const arr = byTenant.get(e.tenantId);
    if (arr) arr.push(e); else byTenant.set(e.tenantId, [e]);
  }

  let contractual = 0, received = 0, unverifiedCount = 0;
  for (const t of holding) {
    const pos = calcDepositPosition(t.depositAmount, byTenant.get(t.id) ?? []);
    contractual += pos.contractual;
    if (pos.verification === "VERIFIED") received += pos.received ?? 0;
    else if (pos.contractual > 0) unverifiedCount++;
  }
  if (contractual === 0 && received === 0) return undefined;
  return { contractual, received, unverifiedCount };
}

// ── Net-vs-remitted reconciliation ────────────────────────────────────────────
//
// OwnerPayout rows dated inside the report period vs the period's net profit.
// Omitted when the org has never recorded a payout for these properties, so
// reports don't show a scary "nothing remitted" by default.

async function buildRemittance(
  netProfit: number,
  propertyIds: string[],
  from: Date,
  toExcl: Date,
): Promise<ReportData["remittance"]> {
  const inPeriod = await prisma.ownerPayout.aggregate({
    where: { propertyId: { in: propertyIds }, paidAt: { gte: from, lt: toExcl } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const count = inPeriod._count._all ?? 0;
  if (count === 0) {
    const anyEver = await prisma.ownerPayout.count({ where: { propertyId: { in: propertyIds } } });
    if (anyEver === 0) return undefined;
  }
  const remitted = inPeriod._sum.amount ?? 0;
  return { netProfit, remitted, difference: netProfit - remitted };
}

// ── Shared data builder ────────────────────────────────────────────────────────

async function buildReportData(y: number, m: number, session: any, propertyIds: string[]): Promise<ReportData> {
  const { from, to } = getMonthRange(y, m);
  const periodLabel = format(from, "MMMM yyyy");

  const [properties, tenants, incomeEntries, expenseEntries, pettyCash, agreements, feeConfigs] = await Promise.all([
    prisma.property.findMany({
      where: { id: { in: propertyIds } },
      include: {
        units: true,
        owner:        { select: { name: true, email: true } },
        manager:      { select: { name: true, email: true } },
        organization: { select: { name: true } },
      },
    }),
    prisma.tenant.findMany({
      // Tenancy OVERLAPS the report period — not just currently-active
      // tenants — so historical reports keep showing since-vacated tenants.
      // (Their income always counted toward the totals; the rent-collection
      // rows were silently missing.) Inactive rows with no vacatedDate fall
      // back to leaseEnd for the overlap test.
      where: {
        unit: { propertyId: { in: propertyIds } },
        leaseStart: { lte: to },
        OR: [
          { isActive: true },
          { vacatedDate: { gte: from } },
          { isActive: false, vacatedDate: null, leaseEnd: { gte: from } },
        ],
      },
      include: {
        unit: { include: { property: true } },
        rentHistory: { select: { monthlyRent: true, effectiveDate: true } },
      },
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
    prisma.managementAgreement.findMany({
      where: { propertyId: { in: propertyIds } },
      select: { propertyId: true, managementFeeRate: true },
    }),
    prisma.managementFeeConfig.findMany({
      where: {
        unit: { propertyId: { in: propertyIds } },
        effectiveFrom: { lte: to },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
      },
      select: { unitId: true, flatAmount: true, ratePercent: true },
    }),
  ]);

  const grossIncome       = incomeEntries.filter((e) => e.type !== "DEPOSIT").reduce((s, e) => s + e.grossAmount, 0);
  const agentCommissions  = incomeEntries.reduce((s, e) => s + e.agentCommission, 0);
  const totalExpenses     = expenseEntries.filter((e) => !e.isSunkCost).reduce((s, e) => s + e.amount, 0);
  const netProfit         = grossIncome - agentCommissions - totalExpenses;

  // Cumulative income to date: ALL income received up to the end of this
  // period (cash basis, deposits excluded) — not just this period's.
  const toDateAgg = await prisma.incomeEntry.aggregate({
    where: { type: { not: "DEPOSIT" }, date: { lte: to }, unit: { propertyId: { in: propertyIds } } },
    _sum: { grossAmount: true },
  });
  const incomeToDate = toDateAgg._sum.grossAmount ?? 0;

  const propertyNames    = properties.map((p) => p.name).join(" & ");
  const organizationName = properties[0]?.organization?.name ?? "Property Manager";
  const ownerName        = properties[0]?.owner?.name   ?? properties[0]?.owner?.email   ?? "Owner";
  const managerName      = properties[0]?.manager?.name ?? properties[0]?.manager?.email ?? session?.user?.name ?? "Manager";
  const totalUnits       = properties.reduce((s, p) => s + p.units.length, 0);
  // Distinct units — a unit whose old tenant vacated and new tenant moved in
  // within the period must not count twice.
  const occupiedUnits    = new Set(tenants.map((t) => t.unitId)).size;
  const occupancyRate    = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

  const longTermIds  = new Set(properties.filter((p) => p.type === "LONGTERM").map((p) => p.id));
  const riaraTenants = tenants.filter((t) => longTermIds.has(t.unit.propertyId));
  const albaUnits    = properties.filter((p) => p.type === "AIRBNB").flatMap((p) => p.units);
  const longTermName = properties.filter((p) => p.type === "LONGTERM").map((p) => p.name).join(" & ") || "Long-Term Rent";
  const shortLetName = properties.filter((p) => p.type === "AIRBNB").map((p) => p.name).join(" & ")  || "Short-Let Performance";

  // Rent collection — expected rent resolved for the REPORT month, so past
  // months use the rent that applied then (RentHistory), not today's rate.
  // Schedule-aware: quarterly/biannual/annual payers owe the FULL period
  // amount on billing months (anchored to lease start) and 0 in between.
  const rentCollection = riaraTenants.map((t) => {
    const unitIncome = incomeEntries.filter((e) => e.unitId === t.unitId && e.type === "LONGTERM_RENT");
    const received   = unitIncome.reduce((s, e) => s + e.grossAmount, 0);
    const sched = scheduledExpectedForMonth({
      leaseStart: t.leaseStart,
      frequency: t.paymentFrequency,
      month: from,
      rentForMonth: (m) => resolveExpectedRent(t.rentHistory, t.monthlyRent, m),
    });
    const expectedRent  = sched.amount;
    const serviceCharge = sched.due ? t.serviceCharge * frequencyMonths(t.paymentFrequency) : 0;
    return {
      tenantName:    t.isActive ? t.name : `${t.name} (vacated)`,
      unit:          t.unit.unitNumber,
      type:          t.unit.type,
      expectedRent,
      serviceCharge,
      received,
      variance:      received - (expectedRent + serviceCharge),
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

  // Management fee — derived per property from real configuration (per-unit
  // ManagementFeeConfig → property rate/flat → agreement rate → 0). A
  // property with no fee arrangement contributes nothing.
  const mgmtOwing = properties.reduce((total, p) => {
    const unitIds = new Set(p.units.map((u) => u.id));
    const propIncome = incomeEntries.filter((e) => unitIds.has(e.unitId));
    return total + calcPropertyManagementFee({
      tenants: uniqueByUnit(tenants.filter((t) => unitIds.has(t.unitId))),
      feeConfigs: feeConfigs.filter((c) => unitIds.has(c.unitId)),
      propertyRatePercent: p.managementFeeRate,
      propertyFlatAmount: p.managementFeeFlat,
      agreementRatePercent: agreements.find((a) => a.propertyId === p.id)?.managementFeeRate,
      grossIncome: propIncome.filter((e) => e.type !== "DEPOSIT").reduce((s, e) => s + e.grossAmount, 0),
    });
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
    if (!t.isActive) return false; // vacated tenants can't have lease alerts
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

  // Headline collection rate — roll-up of the rent-collection rows.
  const collectionExpected = rentCollection.reduce((s, r) => s + r.expectedRent + r.serviceCharge, 0);
  const collectionReceived = rentCollection.reduce((s, r) => s + r.received, 0);
  const collectionRate = collectionExpected > 0
    ? Math.min(999, Math.round((collectionReceived / collectionExpected) * 100))
    : undefined;

  // Capital / sunk-cost items — excluded from the P&L, itemised for visibility.
  const sunkEntries = expenseEntries
    .filter((e) => e.isSunkCost)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const capitalItems = sunkEntries.length > 0
    ? {
        total: sunkEntries.reduce((s, e) => s + e.amount, 0),
        rows: sunkEntries.map((e) => ({
          date: formatDate(e.date),
          description: e.description ?? e.category.replace(/_/g, " "),
          category: e.category,
          amount: e.amount,
        })),
      }
    : undefined;

  // Vacancy / void-loss analysis (tenancy-derived, estimated)
  const monthStart = new Date(y, m - 1, 1);
  const monthEndExcl = new Date(y, m, 1);
  const vacancy = await buildVacancy(properties, monthStart, monthEndExcl);

  // Period-over-period comparison: previous month + same month last year
  const comparison = await buildComparison(
    { grossIncome, totalExpenses, netProfit },
    [
      { label: format(new Date(y, m - 2, 1), "MMM yyyy"), from: new Date(y, m - 2, 1), toExcl: monthStart },
      { label: format(new Date(y - 1, m - 1, 1), "MMM yyyy"), from: new Date(y - 1, m - 1, 1), toExcl: new Date(y - 1, m, 1) },
    ],
    propertyIds,
  );

  // Deposit liability + owner remittance reconciliation
  const depositSummary = await buildDepositSummary(tenants, to);
  const remittance = await buildRemittance(netProfit, propertyIds, monthStart, monthEndExcl);

  // Tax summary
  const allLineItems = expenseTaxItems(expenseEntries as any);
  const taxSummary = buildTaxSummary(incomeEntries, allLineItems);

  // Arrears aging (point-in-time, invoice-based)
  const arrearsAging = await buildReportAging(propertyIds, to);

  return {
    title:                `${propertyNames} — ${periodLabel}`,
    property:             propertyNames,
    currency:             properties[0]?.currency ?? "USD",
    organizationName,
    longTermPropertyName: longTermName,
    shortLetPropertyName: shortLetName,
    ownerName,
    managerName,
    period:      periodLabel,
    generatedAt: format(new Date(), "d MMM yyyy, HH:mm"),
    generatedBy: session?.user?.name ?? session?.user?.email ?? "Manager",
    kpis:        { grossIncome, agentCommissions, totalExpenses, netProfit, occupancyRate, incomeToDate,
                   ...(collectionRate != null ? { collectionRate } : {}) },
    rentCollection,
    albaPerformance,
    expenses,
    vendorSpend,
    ...(vacancy ? { vacancy } : {}),
    ...(comparison ? { comparison } : {}),
    ...(capitalItems ? { capitalItems } : {}),
    ...(depositSummary ? { depositSummary } : {}),
    ...(remittance ? { remittance } : {}),
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
    ...(arrearsAging ? { arrearsAging } : {}),
  };
}

// ── Range data builder (quarterly + annual) ─────────────────────────────────────
//
// Aggregates a multi-month period into a single ReportData. `monthsMult` scales the
// per-month expected rent / flat management fee (3 for a quarter, 12 for a year);
// `daysInRange` is the calendar-day count used for Airbnb occupancy.

async function buildRangeReportData(
  from: Date,
  to: Date,
  periodLabel: string,
  monthsMult: number,
  daysInRange: number,
  session: any,
  propertyIds: string[],
): Promise<ReportData> {
  const [properties, tenants, incomeEntries, expenseEntries, pettyCash, agreements, feeConfigs] = await Promise.all([
    prisma.property.findMany({
      where: { id: { in: propertyIds } },
      include: {
        units: true,
        owner:        { select: { name: true, email: true } },
        manager:      { select: { name: true, email: true } },
        organization: { select: { name: true } },
      },
    }),
    prisma.tenant.findMany({
      // Tenancy OVERLAPS the report period — not just currently-active
      // tenants — so historical reports keep showing since-vacated tenants.
      // (Their income always counted toward the totals; the rent-collection
      // rows were silently missing.) Inactive rows with no vacatedDate fall
      // back to leaseEnd for the overlap test.
      where: {
        unit: { propertyId: { in: propertyIds } },
        leaseStart: { lte: to },
        OR: [
          { isActive: true },
          { vacatedDate: { gte: from } },
          { isActive: false, vacatedDate: null, leaseEnd: { gte: from } },
        ],
      },
      include: {
        unit: { include: { property: true } },
        rentHistory: { select: { monthlyRent: true, effectiveDate: true } },
      },
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
      include: {
        vendor: { select: { id: true, name: true, category: true } },
        lineItems: { select: { taxAmount: true, taxType: true, isVatable: true } },
      },
    }),
    prisma.pettyCash.findMany({ where: { propertyId: { in: propertyIds } }, orderBy: { date: "asc" } }),
    prisma.managementAgreement.findMany({
      where: { propertyId: { in: propertyIds } },
      select: { propertyId: true, managementFeeRate: true },
    }),
    prisma.managementFeeConfig.findMany({
      where: {
        unit: { propertyId: { in: propertyIds } },
        effectiveFrom: { lte: to },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
      },
      select: { unitId: true, flatAmount: true, ratePercent: true },
    }),
  ]);

  const grossIncome      = incomeEntries.filter((e) => e.type !== "DEPOSIT").reduce((s, e) => s + e.grossAmount, 0);
  const agentCommissions = incomeEntries.reduce((s, e) => s + e.agentCommission, 0);
  const totalExpenses    = expenseEntries.filter((e) => !e.isSunkCost).reduce((s, e) => s + e.amount, 0);
  const netProfit        = grossIncome - agentCommissions - totalExpenses;

  // Cumulative income to date (cash basis, deposits excluded) — all-time up
  // to the period end (`to` is exclusive here).
  const toDateAggR = await prisma.incomeEntry.aggregate({
    where: { type: { not: "DEPOSIT" }, date: { lt: to }, unit: { propertyId: { in: propertyIds } } },
    _sum: { grossAmount: true },
  });
  const incomeToDate = toDateAggR._sum.grossAmount ?? 0;

  const propertyNames    = properties.map((p) => p.name).join(" & ");
  const organizationName = properties[0]?.organization?.name ?? "Property Manager";
  const ownerName        = properties[0]?.owner?.name   ?? properties[0]?.owner?.email   ?? "Owner";
  const managerName      = properties[0]?.manager?.name ?? properties[0]?.manager?.email ?? session?.user?.name ?? "Manager";
  const totalUnits       = properties.reduce((s, p) => s + p.units.length, 0);
  // Distinct units — a unit whose old tenant vacated and new tenant moved in
  // within the period must not count twice.
  const occupiedUnits    = new Set(tenants.map((t) => t.unitId)).size;
  const occupancyRate    = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

  const longTermIdsQ  = new Set(properties.filter((p) => p.type === "LONGTERM").map((p) => p.id));
  const riaraTenants  = tenants.filter((t) => longTermIdsQ.has(t.unit.propertyId));
  const albaUnitsQ    = properties.filter((p) => p.type === "AIRBNB").flatMap((p) => p.units);
  const longTermNameQ = properties.filter((p) => p.type === "LONGTERM").map((p) => p.name).join(" & ") || "Long-Term Rent";
  const shortLetNameQ = properties.filter((p) => p.type === "AIRBNB").map((p) => p.name).join(" & ")  || "Short-Let Performance";

  // Rent collection — expected summed per month across the period, resolving
  // each month's rent from RentHistory (an escalation mid-period is respected).
  // Schedule-aware: only billing months (per the tenant's payment cadence)
  // contribute expected rent + service charge to the period total.
  const rentCollection = riaraTenants.map((t) => {
    const unitIncome = incomeEntries.filter((e) => e.unitId === t.unitId && e.type === "LONGTERM_RENT");
    const received   = unitIncome.reduce((s, e) => s + e.grossAmount, 0);
    let expectedRent  = 0;
    let serviceCharge = 0;
    // Vacated tenants only owe rent for the months they were in occupancy
    // (up to vacatedDate; inactive rows without one fall back to leaseEnd).
    const tenancyEndMs = (t.vacatedDate ?? (t.isActive ? null : t.leaseEnd))?.getTime() ?? Infinity;
    for (let i = 0; i < monthsMult; i++) {
      const mStart = new Date(from.getFullYear(), from.getMonth() + i, 1);
      if (mStart.getTime() > tenancyEndMs) break;
      if (new Date(from.getFullYear(), from.getMonth() + i + 1, 0) < t.leaseStart) continue;
      const sched = scheduledExpectedForMonth({
        leaseStart: t.leaseStart,
        frequency: t.paymentFrequency,
        month: mStart,
        rentForMonth: (m) => resolveExpectedRent(t.rentHistory, t.monthlyRent, m),
      });
      expectedRent += sched.amount;
      if (sched.due) serviceCharge += t.serviceCharge * frequencyMonths(t.paymentFrequency);
    }
    return {
      tenantName:    t.isActive ? t.name : `${t.name} (vacated)`,
      unit:          t.unit.unitNumber,
      type:          t.unit.type,
      expectedRent,
      serviceCharge,
      received,
      variance:      received - (expectedRent + serviceCharge),
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
      netRevenue: summary.netRevenue, bookedNights, daysInMonth: daysInRange,
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

  // Management fee — derived per property from real configuration (per-unit
  // ManagementFeeConfig → property rate/flat → agreement rate → 0), with
  // flat/per-unit fees scaled across the period. No fee arrangement = no fee.
  const mgmtOwing = properties.reduce((total, p) => {
    const unitIds = new Set(p.units.map((u) => u.id));
    const propIncome = incomeEntries.filter((e) => unitIds.has(e.unitId));
    return total + calcPropertyManagementFee({
      tenants: uniqueByUnit(tenants.filter((t) => unitIds.has(t.unitId))),
      feeConfigs: feeConfigs.filter((c) => unitIds.has(c.unitId)),
      propertyRatePercent: p.managementFeeRate,
      propertyFlatAmount: p.managementFeeFlat,
      agreementRatePercent: agreements.find((a) => a.propertyId === p.id)?.managementFeeRate,
      grossIncome: propIncome.filter((e) => e.type !== "DEPOSIT").reduce((s, e) => s + e.grossAmount, 0),
      monthsMult,
    });
  }, 0);
  const mgmtPaid = expenseEntries.filter((e) => e.category === "MANAGEMENT_FEE").reduce((s, e) => s + e.amount, 0);

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
  // Vacated tenants can't have lease alerts.
  tenants.filter((t) => t.isActive && ["WARNING","CRITICAL","TBC"].includes(getLeaseStatus(t.leaseEnd))).forEach((t) => {
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

  // Headline collection rate — roll-up of the rent-collection rows.
  const collectionExpectedQ = rentCollection.reduce((s, r) => s + r.expectedRent + r.serviceCharge, 0);
  const collectionReceivedQ = rentCollection.reduce((s, r) => s + r.received, 0);
  const collectionRateQ = collectionExpectedQ > 0
    ? Math.min(999, Math.round((collectionReceivedQ / collectionExpectedQ) * 100))
    : undefined;

  // Capital / sunk-cost items — excluded from the P&L, itemised for visibility.
  const sunkEntriesQ = expenseEntries
    .filter((e) => e.isSunkCost)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const capitalItemsQ = sunkEntriesQ.length > 0
    ? {
        total: sunkEntriesQ.reduce((s, e) => s + e.amount, 0),
        rows: sunkEntriesQ.map((e) => ({
          date: formatDate(e.date),
          description: e.description ?? e.category.replace(/_/g, " "),
          category: e.category,
          amount: e.amount,
        })),
      }
    : undefined;

  // Vacancy / void-loss analysis (tenancy-derived, estimated)
  const vacancyQ = await buildVacancy(properties, from, to);

  // Period-over-period comparison: the same-length immediately-preceding
  // period, plus the prior calendar year when this range IS a calendar year.
  const prevFrom = new Date(from.getFullYear(), from.getMonth() - monthsMult, 1);
  const prevLabel = monthsMult === 1
    ? format(prevFrom, "MMM yyyy")
    : `${format(prevFrom, "MMM yyyy")} – ${format(new Date(from.getFullYear(), from.getMonth() - 1, 1), "MMM yyyy")}`;
  const isCalendarYear = monthsMult === 12 && from.getMonth() === 0 && from.getDate() === 1;
  const comparisonQ = await buildComparison(
    { grossIncome, totalExpenses, netProfit },
    [
      { label: prevLabel, from: prevFrom, toExcl: from },
      ...(isCalendarYear
        ? [{
            label: String(from.getFullYear() - 1),
            from: new Date(from.getFullYear() - 1, 0, 1),
            toExcl: new Date(from.getFullYear(), 0, 1),
          }]
        : []),
    ],
    propertyIds,
  );

  // Month-by-month P&L buckets — computed in memory from the entries already
  // fetched for the range, never re-queried per month.
  const monthlyBreakdown = monthsMult > 1
    ? Array.from({ length: monthsMult }, (_, i) => {
        const mStart = new Date(from.getFullYear(), from.getMonth() + i, 1);
        const mEnd   = new Date(from.getFullYear(), from.getMonth() + i + 1, 1);
        const inc = incomeEntries.filter((e) => e.date >= mStart && e.date < mEnd);
        const exp = expenseEntries.filter((e) => e.date >= mStart && e.date < mEnd);
        const gross = inc.filter((e) => e.type !== "DEPOSIT").reduce((s, e) => s + e.grossAmount, 0);
        const comm  = inc.reduce((s, e) => s + e.agentCommission, 0);
        const opex  = exp.filter((e) => !e.isSunkCost).reduce((s, e) => s + e.amount, 0);
        return {
          label: format(mStart, "MMM yyyy"),
          grossIncome: gross,
          totalExpenses: opex,
          netProfit: gross - comm - opex,
        };
      })
    : undefined;

  // Deposit liability + owner remittance reconciliation (`to` is exclusive)
  const periodEndQ = new Date(to.getTime() - 1);
  const depositSummaryQ = await buildDepositSummary(tenants, periodEndQ);
  const remittanceQ = await buildRemittance(netProfit, propertyIds, from, to);

  const allLineItemsQ = expenseTaxItems(expenseEntries as any);
  const taxSummaryQ   = buildTaxSummary(incomeEntries, allLineItemsQ);
  // `to` is exclusive in the range builder — the period's last instant is just before it.
  const arrearsAgingQ = await buildReportAging(propertyIds, new Date(to.getTime() - 1));

  return {
    title:                `${propertyNames} — ${periodLabel}`,
    property:             propertyNames,
    currency:             properties[0]?.currency ?? "USD",
    organizationName,
    longTermPropertyName: longTermNameQ,
    shortLetPropertyName: shortLetNameQ,
    ownerName, managerName,
    period:      periodLabel,
    generatedAt: format(new Date(), "d MMM yyyy, HH:mm"),
    generatedBy: session?.user?.name ?? session?.user?.email ?? "Manager",
    kpis:        { grossIncome, agentCommissions, totalExpenses, netProfit, occupancyRate, incomeToDate,
                   ...(collectionRateQ != null ? { collectionRate: collectionRateQ } : {}) },
    rentCollection, albaPerformance, expenses, vendorSpend,
    ...(monthlyBreakdown ? { monthlyBreakdown } : {}),
    ...(vacancyQ ? { vacancy: vacancyQ } : {}),
    ...(comparisonQ ? { comparison: comparisonQ } : {}),
    ...(capitalItemsQ ? { capitalItems: capitalItemsQ } : {}),
    ...(depositSummaryQ ? { depositSummary: depositSummaryQ } : {}),
    ...(remittanceQ ? { remittance: remittanceQ } : {}),
    pettyCash: {
      totalIn: pcIn, totalOut: pcOut, balance: pcIn - pcOut,
      entries: pettyCash.map((e) => ({ date: formatDate(e.date), description: e.description, type: e.type, amount: e.amount })),
    },
    mgmtFee: { owing: mgmtOwing, paid: mgmtPaid, balance: mgmtPaid - mgmtOwing },
    alerts,
    ...(taxSummaryQ.hasAnyTax ? { taxSummary: taxSummaryQ } : {}),
    ...(arrearsAgingQ ? { arrearsAging: arrearsAgingQ } : {}),
  };
}

// ── Custom month-range parsing (item: "review certain months together") ──────
//
// from/to are inclusive YYYY-MM month keys. Capped at 24 months so a typo'd
// range can't fan a giant aggregation.

function parseMonthRange(fromKey: string, toKey: string):
  | { from: Date; toExcl: Date; label: string; months: number; days: number }
  | null {
  const m = /^(\d{4})-(\d{2})$/;
  const f = fromKey.match(m);
  const t = toKey.match(m);
  if (!f || !t) return null;
  const from = new Date(parseInt(f[1]), parseInt(f[2]) - 1, 1);
  const toStart = new Date(parseInt(t[1]), parseInt(t[2]) - 1, 1);
  if (isNaN(from.getTime()) || isNaN(toStart.getTime()) || toStart < from) return null;
  const months =
    (toStart.getFullYear() * 12 + toStart.getMonth()) -
    (from.getFullYear() * 12 + from.getMonth()) + 1;
  if (months > 24) return null;
  const toExcl = new Date(toStart.getFullYear(), toStart.getMonth() + 1, 1);
  const days = Array.from({ length: months }, (_, i) =>
    getDaysInMonth(new Date(from.getFullYear(), from.getMonth() + i, 1)),
  ).reduce((s, d) => s + d, 0);
  const label =
    months === 1
      ? format(from, "MMMM yyyy")
      : `${format(from, "MMM yyyy")} – ${format(toStart, "MMM yyyy")} Summary`;
  return { from, toExcl, label, months, days };
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

  // Custom month range (?from=YYYY-MM&to=YYYY-MM) — aggregated multi-month view.
  const fromKey = searchParams.get("from");
  const toKey   = searchParams.get("to");
  if (fromKey && toKey) {
    const range = parseMonthRange(fromKey, toKey);
    if (!range) {
      return Response.json({ error: "Invalid range — use from=YYYY-MM&to=YYYY-MM (max 24 months)" }, { status: 400 });
    }
    const data = await buildRangeReportData(
      range.from, range.toExcl, range.label, range.months, range.days, session, scopedIds,
    );
    return Response.json(data);
  }

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

  // Custom month-range PDF (from/to inclusive YYYY-MM)
  if (body.type === "range") {
    const range = parseMonthRange(String(body.from ?? ""), String(body.to ?? ""));
    if (!range) {
      return Response.json({ error: "Invalid range — use from=YYYY-MM&to=YYYY-MM (max 24 months)" }, { status: 400 });
    }
    const data = await buildRangeReportData(
      range.from, range.toExcl, range.label, range.months, range.days, session, scopedIds,
    );
    const buf = await generateReportPDF(data);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="property-report-${body.from}-to-${body.to}.pdf"`,
      },
    });
  }

  // Quarterly PDF
  if (body.type === "quarterly") {
    const q          = parseInt(body.quarter);
    const y          = parseInt(body.year);
    const startMonth = (q - 1) * 3 + 1;
    const from       = new Date(y, startMonth - 1, 1);
    const to         = new Date(y, startMonth - 1 + 3, 1); // exclusive
    const days       = [0, 1, 2].reduce((s, i) => s + getDaysInMonth(new Date(y, startMonth - 1 + i, 1)), 0);
    const data       = await buildRangeReportData(from, to, `Q${q} ${y} Summary`, 3, days, session, scopedIds);
    const buf        = await generateReportPDF(data);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="property-report-Q${q}-${y}.pdf"`,
      },
    });
  }

  // Annual PDF
  if (body.type === "annual") {
    const y    = parseInt(body.year);
    const from = new Date(y, 0, 1);
    const to   = new Date(y + 1, 0, 1); // exclusive
    const days = Array.from({ length: 12 }, (_, i) => getDaysInMonth(new Date(y, i, 1))).reduce((s, d) => s + d, 0);
    const data = await buildRangeReportData(from, to, `${y} Annual Summary`, 12, days, session, scopedIds);
    const buf  = await generateReportPDF(data);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="property-report-${y}-annual.pdf"`,
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
