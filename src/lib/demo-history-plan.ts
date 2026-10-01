// Pure planning for the demo seeds' back history (see demo-history.ts).
//
// Demo tenants' leases start a year (or more) back, but each demo only seeds
// the last few months of invoices and payments. The tenant ledger and the
// Income page's arrears view count rent from the lease start, so without the
// earlier months every demo tenant looked ~9 months in arrears. These helpers
// decide what the earlier months should have held: one PAID invoice per
// billing month, for exactly what the ledger expects (rent from the rent
// history + service charge, following the payment schedule).

import { resolveExpectedRent, type RentHistoryPoint } from "@/lib/rent-resolution";
import { scheduledExpectedForMonth, frequencyMonths } from "@/lib/rent-schedule";

export interface HistoryTenant {
  leaseStart: Date;
  monthlyRent: number;
  serviceCharge: number;
  paymentFrequency: string | null;
  rentHistory: RentHistoryPoint[];
}

export interface HistoryMonth {
  year: number;
  /** 0-indexed. */
  month: number;
  rent: number;
  serviceCharge: number;
}

/**
 * Billing months from the lease start up to (not including) `cutoff` — the
 * first month the demo already has data for — with what each one bills.
 */
export function paidHistoryMonths(t: HistoryTenant, cutoff: Date): HistoryMonth[] {
  const out: HistoryMonth[] = [];
  const stop = new Date(cutoff.getFullYear(), cutoff.getMonth(), 1).getTime();
  const periodMonths = frequencyMonths(t.paymentFrequency);
  for (
    let m = new Date(t.leaseStart.getFullYear(), t.leaseStart.getMonth(), 1);
    m.getTime() < stop;
    m = new Date(m.getFullYear(), m.getMonth() + 1, 1)
  ) {
    const sched = scheduledExpectedForMonth({
      leaseStart: t.leaseStart,
      frequency: t.paymentFrequency,
      month: m,
      rentForMonth: (x) => resolveExpectedRent(t.rentHistory, t.monthlyRent, x),
    });
    if (!sched.due) continue;
    out.push({
      year: m.getFullYear(),
      month: m.getMonth(),
      rent: Math.round(sched.amount * 100) / 100,
      serviceCharge: Math.round(t.serviceCharge * periodMonths * 100) / 100,
    });
  }
  return out;
}

export interface ExpenseSample {
  category: string;
  description: string | null;
  amount: number;
  date: Date;
}

/**
 * The property's MONTHLY running costs, read off the seeded window: an
 * expense (same category, description and amount) seen in at least two
 * different months. One-offs and quarterly bills are left out.
 */
export function recurringMonthlyExpenses(samples: ExpenseSample[]): (ExpenseSample & { day: number })[] {
  const groups = new Map<string, ExpenseSample[]>();
  for (const s of samples) {
    const key = `${s.category}|${s.description ?? ""}|${s.amount}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const out: (ExpenseSample & { day: number })[] = [];
  groups.forEach((rows) => {
    const months = new Set(rows.map((r) => `${r.date.getFullYear()}-${r.date.getMonth()}`));
    if (months.size < 2) return;
    const first = rows.reduce((a, b) => (a.date.getTime() <= b.date.getTime() ? a : b));
    out.push({ ...first, day: first.date.getDate() });
  });
  return out;
}
