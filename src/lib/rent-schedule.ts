// Payment-schedule helpers for tenants who pay quarterly / biannually /
// annually in advance. The monthly collection view must not show a monthly
// "expected" (or a Pending status) in months where nothing is due — only the
// billing month of each period carries the period's full amount.

export const FREQUENCY_MONTHS: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  BIANNUAL: 6,
  ANNUAL: 12,
};

/** Months covered per payment for a tenant's cadence (1 when unset/unknown). */
export function frequencyMonths(frequency?: string | null): number {
  return (frequency && FREQUENCY_MONTHS[frequency]) || 1;
}

export interface ScheduledExpected {
  /** True when a payment falls due in this month (always true for monthly). */
  due: boolean;
  /** Amount due this month: the sum of rent across the covered months on a
   *  billing month, 0 otherwise. */
  amount: number;
}

/**
 * What a tenant owes in the calendar month containing `month`, given their
 * payment cadence anchored to lease start. `rentForMonth` supplies the
 * (possibly escalating) rent for each covered month — pass a RentHistory-aware
 * resolver so a mid-period escalation is summed correctly.
 */
export function scheduledExpectedForMonth(opts: {
  leaseStart: Date | string;
  frequency?: string | null;
  month: Date;
  rentForMonth: (m: Date) => number;
}): ScheduledExpected {
  const n = frequencyMonths(opts.frequency);
  const monthStart = new Date(opts.month.getFullYear(), opts.month.getMonth(), 1);

  if (n === 1) {
    return { due: true, amount: opts.rentForMonth(monthStart) };
  }

  const ls = new Date(opts.leaseStart);
  const elapsed =
    (monthStart.getFullYear() - ls.getFullYear()) * 12 +
    (monthStart.getMonth() - ls.getMonth());

  // Before lease start, or mid-period (already covered by the last billing
  // month's payment): nothing due.
  if (elapsed < 0 || elapsed % n !== 0) {
    return { due: false, amount: 0 };
  }

  let amount = 0;
  for (let i = 0; i < n; i++) {
    amount += opts.rentForMonth(
      new Date(monthStart.getFullYear(), monthStart.getMonth() + i, 1),
    );
  }
  return { due: true, amount };
}

export interface BillingPeriod {
  /** First month of the period that contains the month asked about. */
  start: Date;
  /** First month of the following period. */
  next: Date;
  /** The month asked about is the period's first month — the one that is billed. */
  isBillingMonth: boolean;
  /** The month is before billing (lease start) begins; `start` is then the first billing month. */
  beforeStart: boolean;
}

/**
 * Which billing period a month falls in for a quarterly / bi-annual / annual
 * payer — the same lease-start anchor as scheduledExpectedForMonth. Monthly
 * payers: every month is its own period.
 */
export function billingPeriodOf(leaseStart: Date | string, frequency: string | null | undefined, month: Date): BillingPeriod {
  const n = frequencyMonths(frequency);
  const m = new Date(month.getFullYear(), month.getMonth(), 1);
  const ls = new Date(leaseStart);
  const anchor = new Date(ls.getFullYear(), ls.getMonth(), 1);
  const elapsed = (m.getFullYear() - anchor.getFullYear()) * 12 + (m.getMonth() - anchor.getMonth());
  if (n === 1) return { start: m, next: new Date(m.getFullYear(), m.getMonth() + 1, 1), isBillingMonth: true, beforeStart: elapsed < 0 };
  if (elapsed < 0) return { start: anchor, next: new Date(anchor.getFullYear(), anchor.getMonth() + n, 1), isBillingMonth: false, beforeStart: true };
  const offset = elapsed % n;
  const start = new Date(m.getFullYear(), m.getMonth() - offset, 1);
  return { start, next: new Date(start.getFullYear(), start.getMonth() + n, 1), isBillingMonth: offset === 0, beforeStart: false };
}
