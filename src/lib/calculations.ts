// Structural input types — money fields are plain numbers (the Prisma client
// converts Decimal columns to number at the boundary; see src/lib/prisma.ts).
export interface PettyCashLike {
  type: string;          // "IN" | "OUT"
  status: string;        // "APPROVED" | "PENDING" | "REJECTED"
  amount: number;
}

export type PettyCashWithBalance<T extends PettyCashLike = PettyCashLike> = T & {
  balance: number;
};

/** Compute running balance for petty cash entries (must be sorted by date ASC).
 *  PENDING and REJECTED entries do not affect the balance — only APPROVED counts. */
export function calcPettyCashBalance<T extends PettyCashLike>(entries: T[]): PettyCashWithBalance<T>[] {
  let running = 0;
  return entries.map((entry) => {
    const counts = entry.status === "APPROVED";
    if (counts) {
      if (entry.type === "IN") {
        running += entry.amount;
      } else {
        running -= entry.amount;
      }
    }
    return { ...entry, balance: running };
  });
}

/** Total petty cash balance (APPROVED entries only) */
export function calcPettyCashTotal(entries: PettyCashLike[]): number {
  return entries
    .filter((e) => e.status === "APPROVED")
    .reduce((acc, e) => acc + (e.type === "IN" ? e.amount : -e.amount), 0);
}

/** Derive a line item's net `amount` from an optional qty × rate breakdown.
 *  The Decimal(14,2) column requires the product rounded to 2dp before
 *  persisting. Quantity may be fractional (2.5 kg). The result IS the net
 *  `amount` everything downstream reads — qty/rate are just the inputs that
 *  produced it. Discount (informational) and VAT still operate on this net. */
export function calcQtyRateAmount(quantity: number, unitRate: number): number {
  return Math.round(quantity * unitRate * 100) / 100;
}

export type ExpensePaymentStatus = "PAID" | "PARTIAL" | "UNPAID";

export interface ExpensePayment {
  total: number;
  paid: number;
  outstanding: number;
  status: ExpensePaymentStatus;
}

/** Unified payment/outstanding-balance for an expense. Line items, when present,
 *  are the source of truth (sum their amountPaid); otherwise the expense-level
 *  amountPaid is used. Status is derived, never stored. */
export function calcExpensePayment(expense: {
  amount: number;
  amountPaid?: number | null;
  lineItems?: { amountPaid?: number | null }[] | null;
}): ExpensePayment {
  const total = expense.amount;
  const paid = expense.lineItems?.length
    ? expense.lineItems.reduce((s, li) => s + (li.amountPaid ?? 0), 0)
    : expense.amountPaid ?? 0;
  const outstanding = Math.max(total - paid, 0);
  const status: ExpensePaymentStatus =
    paid <= 0 ? "UNPAID" : paid >= total ? "PAID" : "PARTIAL";
  return { total, paid, outstanding, status };
}

/** Net income = gross income - agent commissions - operating expenses (excl sunk costs) */
export function calcNetIncome(
  grossIncome: number,
  commissions: number,
  expenses: { amount: number; isSunkCost: boolean }[]
): number {
  const operatingExpenses = expenses
    .filter((e) => !e.isSunkCost)
    .reduce((sum, e) => sum + e.amount, 0);
  return grossIncome - commissions - operatingExpenses;
}

/** Calculate occupancy rate for Alba Gardens units */
export function calcOccupancyRate(
  incomeEntries: { checkIn: Date | string | null; checkOut: Date | string | null }[],
  daysInPeriod: number
): number {
  if (daysInPeriod === 0) return 0;
  // Sum booked nights from check-in/check-out ranges
  let bookedDays = 0;
  for (const entry of incomeEntries) {
    if (entry.checkIn && entry.checkOut) {
      const msPerDay = 1000 * 60 * 60 * 24;
      bookedDays += Math.round(
        (new Date(entry.checkOut).getTime() - new Date(entry.checkIn).getTime()) / msPerDay
      );
    }
  }
  return Math.min(bookedDays / daysInPeriod, 1);
}

/**
 * Calculate interest on an overdue rent amount.
 * @param unpaidAmount  - KSh shortfall (expected − paid)
 * @param annualRatePct - annual interest rate as a percentage (e.g. 12 for 12%)
 * @param daysOverdue   - days elapsed since the due date
 */
export function calcLateInterest(
  unpaidAmount: number,
  annualRatePct: number,
  daysOverdue: number,
): number {
  if (annualRatePct <= 0 || daysOverdue <= 0 || unpaidAmount <= 0) return 0;
  return unpaidAmount * (annualRatePct / 100 / 365) * daysOverdue;
}

/** Summary stats for a unit in a given period */
// Loosened input types so callers can pass slimmer Prisma selects without
// needing every IncomeEntry / ExpenseEntry column — only the fields actually
// read below are required.
export function calcUnitSummary(
  incomeEntries: { grossAmount: number; agentCommission: number }[],
  expenseEntries: { category: string; amount: number; isSunkCost: boolean }[]
) {
  const grossIncome = incomeEntries.reduce((s, e) => s + e.grossAmount, 0);
  const totalCommissions = incomeEntries.reduce((s, e) => s + e.agentCommission, 0);
  const netRevenue = grossIncome - totalCommissions;
  const fixedExpenses = expenseEntries
    .filter((e) => !e.isSunkCost && ["SERVICE_CHARGE", "WIFI", "WATER", "CLEANER"].includes(e.category))
    .reduce((s, e) => s + e.amount, 0);
  const variableExpenses = expenseEntries
    .filter((e) => !e.isSunkCost && !["SERVICE_CHARGE", "WIFI", "WATER", "CLEANER"].includes(e.category))
    .reduce((s, e) => s + e.amount, 0);
  const sunkCosts = expenseEntries.filter((e) => e.isSunkCost).reduce((s, e) => s + e.amount, 0);
  const totalExpenses = fixedExpenses + variableExpenses;
  const netProfit = netRevenue - totalExpenses;

  return {
    grossIncome,
    totalCommissions,
    netRevenue,
    fixedExpenses,
    variableExpenses,
    sunkCosts,
    totalExpenses,
    netProfit,
  };
}
