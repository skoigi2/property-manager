import type { ExpenseEntry, IncomeEntry, PettyCash, ManagementFeeConfig, UnitType } from "@prisma/client";

export interface PettyCashWithBalance extends PettyCash {
  balance: number;
}

/** Compute running balance for petty cash entries (must be sorted by date ASC).
 *  PENDING and REJECTED entries do not affect the balance — only APPROVED counts. */
export function calcPettyCashBalance(entries: PettyCash[]): PettyCashWithBalance[] {
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
export function calcPettyCashTotal(entries: PettyCash[]): number {
  return entries
    .filter((e) => e.status === "APPROVED")
    .reduce((acc, e) => acc + (e.type === "IN" ? e.amount : -e.amount), 0);
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
  expenses: ExpenseEntry[]
): number {
  const operatingExpenses = expenses
    .filter((e) => !e.isSunkCost)
    .reduce((sum, e) => sum + e.amount, 0);
  return grossIncome - commissions - operatingExpenses;
}

/** Calculate management fee for a unit given its config */
export function calcManagementFee(
  config: ManagementFeeConfig | null | undefined,
  grossRevenue: number
): number {
  if (!config) return 0;
  if (config.flatAmount != null) return config.flatAmount;
  return (config.ratePercent / 100) * grossRevenue;
}

/** Riara One flat management fees — only defined for types used in the property */
export const RIARA_MGMT_FEE: Partial<Record<UnitType, number>> = {
  ONE_BED: 6000,
  TWO_BED: 8800,
};

/** Alba Gardens management fee rate */
export const ALBA_MGMT_FEE_RATE = 0.1; // 10%

/** Calculate occupancy rate for Alba Gardens units */
export function calcOccupancyRate(
  incomeEntries: IncomeEntry[],
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
  incomeEntries: Pick<IncomeEntry, "grossAmount" | "agentCommission">[],
  expenseEntries: Pick<ExpenseEntry, "category" | "amount" | "isSunkCost">[]
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
