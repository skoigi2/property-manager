// Service charge budgets — pure rules (no Prisma). A block's service charge
// year has a budget per expense category. Actual cost = the property's
// PROPERTY-scope expenses of the budgeted categories in the year (gross:
// amount + VAT — the tenants bear the VAT the landlord can't recover). Each
// unit carries a share of the total (floor area by default), and a tenant's
// share of the actual cost is their unit's share for the days they occupied
// it; vacant days are the landlord's share.
//
// The year-end statement sets each tenant's share against the service charge
// BILLED on account (Invoice.serviceCharge on their invoices of the year):
// share − billed > 0 is a balancing charge, < 0 a credit. What they actually
// paid is shown for information — unpaid service charge is already chased as
// rent arrears.

import { invoiceOutstandingByBucket, invoiceRentSide, type InvoiceLinesLike } from "@/lib/invoice-payment";

export type ServiceChargeBasisValue = "FLOOR_AREA" | "EQUAL" | "CURRENT_CHARGE";

export const BASIS_LABEL: Record<ServiceChargeBasisValue, string> = {
  FLOOR_AREA: "Floor area",
  EQUAL: "Equal shares",
  CURRENT_CHARGE: "Current service charge",
};

const DAY = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

function dayStart(d: Date | string): Date {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}

export interface ServiceChargeYear {
  from: Date;
  /** Exclusive: the first day of the next service charge year. */
  to: Date;
  days: number;
  label: string;
}

export function serviceChargeYear(year: number, startMonth = 1): ServiceChargeYear {
  const from = new Date(year, startMonth - 1, 1);
  const to = new Date(year + 1, startMonth - 1, 1);
  const days = Math.round((to.getTime() - from.getTime()) / DAY);
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  const last = new Date(to.getFullYear(), to.getMonth(), 0);
  return { from, to, days, label: startMonth === 1 ? String(year) : `${fmt(from)} – ${fmt(last)}` };
}

/** Days of the year up to `asOf` (inclusive), capped at the whole year. */
export function daysElapsed(y: ServiceChargeYear, asOf: Date): number {
  const end = Math.min(dayStart(asOf).getTime() + DAY, y.to.getTime());
  return Math.max(0, Math.round((end - y.from.getTime()) / DAY));
}

// ── Unit weights ─────────────────────────────────────────────────────────────

export interface ScUnit {
  id: string;
  unitNumber: string;
  sizeSqm: number | null;
  /** The current tenant's monthly service charge (0 when vacant). */
  currentCharge: number;
}

export interface UnitWeights {
  /** unitId → share of the whole (sums to 1). */
  share: Record<string, number>;
  /** unitId → the raw weight used (sqm / 1 / charge). */
  weight: Record<string, number>;
  basisUsed: ServiceChargeBasisValue;
  warnings: string[];
}

export function unitWeights(units: ScUnit[], basis: ServiceChargeBasisValue): UnitWeights {
  const warnings: string[] = [];
  const weight: Record<string, number> = {};
  let basisUsed = basis;

  if (units.length === 0) return { share: {}, weight: {}, basisUsed, warnings };

  if (basis === "FLOOR_AREA") {
    const sized = units.filter((u) => (u.sizeSqm ?? 0) > 0);
    if (sized.length === 0) {
      basisUsed = "EQUAL";
      warnings.push("No unit has a floor area recorded — split equally instead. Add sizes on the Properties page to split by floor area.");
    } else {
      const avg = sized.reduce((s, u) => s + (u.sizeSqm ?? 0), 0) / sized.length;
      const missing = units.filter((u) => !((u.sizeSqm ?? 0) > 0));
      if (missing.length > 0) {
        warnings.push(
          `No floor area for unit${missing.length > 1 ? "s" : ""} ${missing.map((u) => u.unitNumber).join(", ")} — counted at the average (${Math.round(avg)} sqm).`,
        );
      }
      for (const u of units) weight[u.id] = (u.sizeSqm ?? 0) > 0 ? (u.sizeSqm as number) : avg;
    }
  }
  if (basis === "CURRENT_CHARGE") {
    const total = units.reduce((s, u) => s + Math.max(u.currentCharge, 0), 0);
    if (total <= 0) {
      basisUsed = "EQUAL";
      warnings.push("No tenant has a service charge set — split equally instead.");
    } else {
      const vacant = units.filter((u) => u.currentCharge <= 0);
      if (vacant.length > 0) {
        warnings.push(`Unit${vacant.length > 1 ? "s" : ""} ${vacant.map((u) => u.unitNumber).join(", ")} pay no service charge now, so carry no share on this basis.`);
      }
      for (const u of units) weight[u.id] = Math.max(u.currentCharge, 0);
    }
  }
  if (basisUsed === "EQUAL") for (const u of units) weight[u.id] = 1;

  const total = Object.values(weight).reduce((s, w) => s + w, 0);
  const share: Record<string, number> = {};
  for (const u of units) share[u.id] = total > 0 ? weight[u.id] / total : 0;
  return { share, weight, basisUsed, warnings };
}

/** A unit's monthly charge that would recover its share of the budget. */
export function suggestedMonthlyCharge(budgetTotal: number, share: number): number {
  return Math.round((budgetTotal * share) / 12);
}

// ── Budget vs actual ─────────────────────────────────────────────────────────

export interface BudgetLineInput {
  category: string;
  amount: number;
}

export interface BudgetVsActualRow {
  category: string;
  budget: number;
  /** Budget pro-rata to the days elapsed. */
  budgetToDate: number;
  actual: number;
  /** actual − budgetToDate: positive = spending ahead of budget. */
  variance: number;
  /** actual ÷ full-year budget. */
  pctUsed: number | null;
}

export function budgetVsActual(
  lines: BudgetLineInput[],
  actualByCategory: Record<string, number>,
  y: ServiceChargeYear,
  asOf: Date,
): { rows: BudgetVsActualRow[]; totals: Omit<BudgetVsActualRow, "category">; fractionElapsed: number } {
  const fraction = daysElapsed(y, asOf) / y.days;
  const rows = lines.map((l) => {
    const actual = round2(actualByCategory[l.category] ?? 0);
    const budgetToDate = round2(l.amount * fraction);
    return {
      category: l.category,
      budget: round2(l.amount),
      budgetToDate,
      actual,
      variance: round2(actual - budgetToDate),
      pctUsed: l.amount > 0 ? actual / l.amount : null,
    };
  });
  const sum = (k: "budget" | "budgetToDate" | "actual") => round2(rows.reduce((s, r) => s + r[k], 0));
  const budget = sum("budget");
  const actual = sum("actual");
  const budgetToDate = sum("budgetToDate");
  return {
    rows,
    totals: { budget, budgetToDate, actual, variance: round2(actual - budgetToDate), pctUsed: budget > 0 ? actual / budget : null },
    fractionElapsed: fraction,
  };
}

// ── Year-end statement ───────────────────────────────────────────────────────

export interface ScTenancy {
  tenantId: string;
  tenantName: string;
  email: string | null;
  unitId: string;
  leaseStart: Date | string;
  /** Last day of occupation (vacated / ended), or null while still in. */
  endDate: Date | string | null;
}

export interface ScInvoice extends InvoiceLinesLike {
  id: string;
  invoiceNumber: string;
  tenantId: string;
  periodYear: number;
  periodMonth: number;
  status: string;
  paidAmount: number | null;
  serviceChargeBudgetId: string | null;
}

/** Days the tenancy overlaps [y.from, asOf] (inclusive of both end days). */
export function occupiedDays(t: Pick<ScTenancy, "leaseStart" | "endDate">, y: ServiceChargeYear, asOf: Date): number {
  const start = Math.max(dayStart(t.leaseStart).getTime(), y.from.getTime());
  const windowEnd = Math.min(dayStart(asOf).getTime() + DAY, y.to.getTime());
  const end = t.endDate ? Math.min(dayStart(t.endDate).getTime() + DAY, windowEnd) : windowEnd;
  return Math.max(0, Math.round((end - start) / DAY));
}

/** Service charge paid on one invoice: its share of the rent-side payment. */
export function serviceChargePaidOnInvoice(inv: ScInvoice): number {
  const sc = inv.serviceCharge ?? 0;
  if (sc <= 0) return 0;
  const rentSide = invoiceRentSide(inv);
  if (rentSide <= 0) return 0;
  const openRentSide = inv.status === "PAID" ? 0 : invoiceOutstandingByBucket(inv, inv.paidAmount).rent;
  return round2((sc * (rentSide - openRentSide)) / rentSide);
}

export interface StatementRow {
  tenantId: string;
  tenantName: string;
  email: string | null;
  unitId: string;
  unitNumber: string;
  days: number;
  /** Unit's share of the whole block (0–1). */
  unitShare: number;
  share: number;
  billed: number;
  paid: number;
  outstanding: number;
  /** share − billed: > 0 balancing charge, < 0 credit. */
  balance: number;
  balancingInvoice: { id: string; invoiceNumber: string; status: string; amount: number } | null;
}

export interface ServiceChargeStatement {
  asOf: Date;
  daysCovered: number;
  yearEnded: boolean;
  actualTotal: number;
  rows: StatementRow[];
  /** Vacant days' share of the cost, per unit — paid by the landlord. */
  landlord: { unitId: string; unitNumber: string; vacantDays: number; share: number }[];
  totals: { share: number; billed: number; paid: number; outstanding: number; charges: number; credits: number; landlord: number };
}

export function yearEndStatement(input: {
  year: ServiceChargeYear;
  asOf: Date;
  actualTotal: number;
  units: ScUnit[];
  weights: UnitWeights;
  tenancies: ScTenancy[];
  invoices: ScInvoice[];
}): ServiceChargeStatement {
  const { year: y, weights } = input;
  const asOf = dayStart(input.asOf).getTime() >= y.to.getTime() ? new Date(y.to.getTime() - DAY) : dayStart(input.asOf);
  const covered = daysElapsed(y, asOf);
  const yearEnded = dayStart(input.asOf).getTime() >= y.to.getTime();
  const perDay = (unitId: string) => (covered > 0 ? (input.actualTotal * (weights.share[unitId] ?? 0)) / covered : 0);
  const unitNo = new Map(input.units.map((u) => [u.id, u.unitNumber]));
  const inYear = (inv: ScInvoice) => {
    const p = new Date(inv.periodYear, inv.periodMonth - 1, 1).getTime();
    return p >= y.from.getTime() && p <= asOf.getTime() && p < y.to.getTime();
  };

  const rows: StatementRow[] = [];
  const occupied: Record<string, number> = {};
  for (const t of input.tenancies) {
    if (!(t.unitId in weights.share)) continue;
    const days = occupiedDays(t, y, asOf);
    const invoices = input.invoices.filter((i) => i.tenantId === t.tenantId);
    const onAccount = invoices.filter((i) => i.status !== "CANCELLED" && !i.serviceChargeBudgetId && inYear(i));
    if (days === 0 && onAccount.length === 0) continue;
    occupied[t.unitId] = (occupied[t.unitId] ?? 0) + days;
    const share = round2(perDay(t.unitId) * days);
    const billed = round2(onAccount.reduce((s, i) => s + (i.serviceCharge ?? 0), 0));
    const paid = round2(onAccount.reduce((s, i) => s + serviceChargePaidOnInvoice(i), 0));
    const balancing = invoices.find((i) => i.serviceChargeBudgetId && i.status !== "CANCELLED") ?? null;
    rows.push({
      tenantId: t.tenantId,
      tenantName: t.tenantName,
      email: t.email,
      unitId: t.unitId,
      unitNumber: unitNo.get(t.unitId) ?? "",
      days,
      unitShare: weights.share[t.unitId] ?? 0,
      share,
      billed,
      paid,
      outstanding: round2(billed - paid),
      balance: round2(share - billed),
      balancingInvoice: balancing
        ? { id: balancing.id, invoiceNumber: balancing.invoiceNumber, status: balancing.status, amount: balancing.serviceCharge ?? 0 }
        : null,
    });
  }
  rows.sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }) || a.tenantName.localeCompare(b.tenantName));

  const landlord = input.units
    .map((u) => {
      const vacantDays = Math.max(0, covered - Math.min(occupied[u.id] ?? 0, covered));
      return { unitId: u.id, unitNumber: u.unitNumber, vacantDays, share: round2(perDay(u.id) * vacantDays) };
    })
    .filter((l) => l.vacantDays > 0 && l.share > 0);

  const sum = (k: "share" | "billed" | "paid" | "outstanding") => round2(rows.reduce((s, r) => s + r[k], 0));
  return {
    asOf,
    daysCovered: covered,
    yearEnded,
    actualTotal: round2(input.actualTotal),
    rows,
    landlord,
    totals: {
      share: sum("share"),
      billed: sum("billed"),
      paid: sum("paid"),
      outstanding: sum("outstanding"),
      charges: round2(rows.filter((r) => r.balance > 0).reduce((s, r) => s + r.balance, 0)),
      credits: round2(rows.filter((r) => r.balance < 0).reduce((s, r) => s - r.balance, 0)),
      landlord: round2(landlord.reduce((s, l) => s + l.share, 0)),
    },
  };
}
