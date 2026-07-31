// Shared rent-ledger builders — the financial logic behind the Income page's
// Arrears view (computeArrears) and the tenant detail Payment Ledger
// (buildLedger). Extracted from the page components so the money math is
// unit-testable and cannot silently drift between the two surfaces.
//
// Both are schedule-aware: quarterly/biannual/annual payers owe the FULL
// period amount on billing months (anchored to lease start, rent-schedule.ts)
// and nothing in between; filler months (nothing due, nothing received) are
// dropped so a period payer's ledger shows one row per billing period.
// Receipts pool oldest-first via allocatePayments (ledger-allocation.ts).

import { addMonths, differenceInMonths, format, startOfMonth } from "date-fns";
import { allocatePayments, type LedgerMonthAllocation } from "@/lib/ledger-allocation";
import { resolveExpectedRent, type RentHistoryPoint } from "@/lib/rent-resolution";
import { scheduledExpectedForMonth, frequencyMonths } from "@/lib/rent-schedule";
import { calcLateInterest } from "@/lib/calculations";

export interface LedgerTenant {
  id: string;
  unitId?: string | null;
  leaseStart?: Date | string | null;
  leaseEnd?: Date | string | null;
  monthlyRent?: number | null;
  serviceCharge?: number | null;
  paymentFrequency?: string | null;
  rentHistory?: RentHistoryPoint[] | null;
}

export interface LedgerEntry {
  type: string;
  date: Date | string;
  grossAmount: number;
  tenantId?: string | null;
  unitId?: string | null;
}

export interface MonthRow {
  year: number;
  month: number; // 0-indexed
  expected: number;
  totalPaid: number;
  balance: number; // negative = short
  isPaid: boolean;
  isPartial: boolean;
  interest: number;
}

export interface ArrearsSummary {
  months: MonthRow[];
  unpaidMonths: MonthRow[];
  totalArrears: number;
  totalInterest: number;
  /** Month-equivalents: one unpaid annual billing period counts as 12. */
  totalMonthsOwed: number;
  lastPaymentDate: Date | string | null;
  hasArrears: boolean;
}

export function computeArrears(
  tenant: LedgerTenant,
  allEntries: LedgerEntry[],
  annualInterestRate = 0,
  today: Date = new Date(),
): ArrearsSummary {
  const leaseStart = new Date(tenant.leaseStart ?? today);

  const start = new Date(leaseStart.getFullYear(), leaseStart.getMonth(), 1);
  const end   = new Date(today.getFullYear(), today.getMonth(), 1);

  const tenantEntries = allEntries.filter(
    (e) =>
      e.type === "LONGTERM_RENT" &&
      (e.tenantId === tenant.id || (tenant.unitId != null && e.unitId === tenant.unitId)),
  );

  // First pass: expected (RentHistory-aware, schedule-aware) + cash received
  // per month.
  const periodMonths = frequencyMonths(tenant.paymentFrequency);
  const rawMonths: { year: number; month: number; expected: number; received: number }[] = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const yr = cursor.getFullYear();
    const mo = cursor.getMonth();
    const paid = tenantEntries
      .filter((e) => {
        const d = new Date(e.date);
        return d.getFullYear() === yr && d.getMonth() === mo;
      })
      .reduce((s, e) => s + e.grossAmount, 0);
    rawMonths.push({
      year: yr,
      month: mo,
      expected: scheduledExpectedForMonth({
        leaseStart: tenant.leaseStart ?? today,
        frequency: tenant.paymentFrequency,
        month: cursor,
        rentForMonth: (m) => resolveExpectedRent(tenant.rentHistory, tenant.monthlyRent ?? 0, m),
      }).amount,
      received: paid,
    });
    cursor = new Date(yr, mo + 1, 1);
  }

  // Drop filler months for period payers — they contribute nothing to the
  // allocation pot, so filtering before allocation is safe.
  const ledgerMonths = periodMonths > 1
    ? rawMonths.filter((m) => m.expected > 0 || m.received > 0)
    : rawMonths;

  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const allocations = allocatePayments(ledgerMonths);
  const months: MonthRow[] = allocations.map((a, i) => {
    const { year: yr, month: mo } = ledgerMonths[i];
    const dueDate = new Date(yr, mo + 1, 1); // 1st of next month
    const daysOverdue = a.shortfall > 0
      ? Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / MS_PER_DAY))
      : 0;
    return {
      year: yr,
      month: mo,
      expected: a.expected,
      totalPaid: a.received,
      balance: a.balance,
      isPaid: a.status === "PAID",
      isPartial: a.status === "PARTIAL",
      interest: calcLateInterest(a.shortfall, annualInterestRate, daysOverdue),
    };
  });

  const unpaidMonths = months.filter((m) => !m.isPaid);
  const totalArrears = allocations.reduce((s, a) => s + a.shortfall, 0);
  const totalInterest = unpaidMonths.reduce((s, m) => s + m.interest, 0);

  const sorted = [...tenantEntries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return {
    months,
    unpaidMonths,
    totalArrears,
    totalInterest,
    totalMonthsOwed: unpaidMonths.length * periodMonths,
    lastPaymentDate: sorted[0]?.date ?? null,
    hasArrears: totalArrears > 0,
  };
}

export type TenantLedgerRow<E extends LedgerEntry = LedgerEntry> = LedgerMonthAllocation & {
  monthLabel: string;
  monthDate: Date;
  payments: E[];
};

/**
 * Month-by-month payment ledger for the tenant detail page. Rows run from
 * lease start to min(lease end, today), newest first. Billing months carry
 * rent + service charge × period months; filler months are dropped for
 * period payers.
 */
export function buildLedger<E extends LedgerEntry>(
  tenant: LedgerTenant | null | undefined,
  incomeEntries: E[],
  today: Date = new Date(),
): TenantLedgerRow<E>[] {
  if (!tenant?.leaseStart) return [];
  const leaseStart = new Date(tenant.leaseStart);
  const leaseEnd   = tenant.leaseEnd ? new Date(tenant.leaseEnd) : today;
  const end        = leaseEnd < today ? leaseEnd : today;
  const totalMonths = Math.max(differenceInMonths(startOfMonth(end), startOfMonth(leaseStart)) + 1, 1);

  const rows: { monthLabel: string; monthDate: Date; expected: number; received: number; payments: E[] }[] = [];
  for (let i = 0; i < totalMonths; i++) {
    const monthDate  = addMonths(startOfMonth(leaseStart), i);
    const monthEnd   = addMonths(monthDate, 1);
    const payments   = incomeEntries.filter((e) => {
      const d = new Date(e.date);
      return d >= monthDate && d < monthEnd && e.type === "LONGTERM_RENT";
    });
    const received = payments.reduce((s, e) => s + e.grossAmount, 0);
    // Expected rent is resolved per month from the RentHistory timeline so
    // past months reflect the rent that applied THEN, following the payment
    // schedule: period payers owe rent + service charge on billing months only.
    const sched = scheduledExpectedForMonth({
      leaseStart: tenant.leaseStart,
      frequency: tenant.paymentFrequency,
      month: monthDate,
      rentForMonth: (m) => resolveExpectedRent(tenant.rentHistory, tenant.monthlyRent ?? 0, m),
    });
    const expected =
      sched.amount +
      (sched.due ? (tenant.serviceCharge ?? 0) * frequencyMonths(tenant.paymentFrequency) : 0);
    rows.push({ monthLabel: format(monthDate, "MMM yyyy"), monthDate, expected, received, payments });
  }

  const ledgerRows =
    frequencyMonths(tenant.paymentFrequency) > 1
      ? rows.filter((r) => r.expected > 0 || r.received > 0)
      : rows;
  const allocated = allocatePayments(ledgerRows);
  return ledgerRows.map((r, i) => ({ ...r, ...allocated[i] })).reverse();
}
