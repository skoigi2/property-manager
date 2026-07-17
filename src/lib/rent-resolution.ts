// Resolve the rent that was EXPECTED for a given historical month from the
// tenant's RentHistory timeline, instead of assuming today's monthlyRent
// applied forever.
//
// Semantics: each RentHistory row means "rent became `monthlyRent` on
// `effectiveDate`". For a given month, the applicable rate is the latest row
// whose effectiveDate falls on or before the END of that month (a mid-month
// change applies to the month it lands in). When no row applies — either the
// tenant has no history at all, or every row post-dates the month — we fall
// back to the tenant's current monthlyRent, which preserves the previous
// behaviour for tenants without history.
//
// To get accurate historical ledgers, record a RentHistory row at lease start
// with the original rent (via the Rent History tab or the bulk importer).

export interface RentHistoryPoint {
  monthlyRent: number;
  effectiveDate: Date | string;
}

/**
 * Rent expected for the calendar month containing `monthDate`.
 * `history` may be in any order; `currentRent` is the tenant's live
 * monthlyRent used as the fallback.
 */
export function resolveExpectedRent(
  history: RentHistoryPoint[] | null | undefined,
  currentRent: number,
  monthDate: Date,
): number {
  if (!history || history.length === 0) return currentRent;

  // Exclusive upper bound: first millisecond of the following month.
  const nextMonthStart = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);

  let bestDate: number | null = null;
  let bestRent = currentRent;
  for (const h of history) {
    const eff = new Date(h.effectiveDate).getTime();
    if (eff < nextMonthStart.getTime() && (bestDate === null || eff > bestDate)) {
      bestDate = eff;
      bestRent = h.monthlyRent;
    }
  }
  return bestDate === null ? currentRent : bestRent;
}

/**
 * True when the tenant's RentHistory timeline disagrees with their current
 * monthlyRent for the CURRENT month — i.e. the latest applicable history row
 * resolves to a different rate than the live field. This happens when rent
 * was edited directly without a history row (possible before edits started
 * auto-appending one) and makes ledgers/reports bill the stale rate.
 * False when there is no history at all (the resolver falls back to
 * currentRent, so nothing can disagree).
 */
export function isRentHistoryOutOfSync(
  history: RentHistoryPoint[] | null | undefined,
  currentRent: number,
  today: Date = new Date(),
): boolean {
  if (!history || history.length === 0) return false;
  return Math.abs(resolveExpectedRent(history, currentRent, today) - currentRent) > 0.01;
}

/**
 * Total expected rent across an inclusive month range (used by quarterly /
 * annual reports where expected was previously `monthlyRent * monthsMult`).
 * `from` is any date inside the first month; `months` is the number of
 * calendar months to include.
 */
export function resolveExpectedRentForRange(
  history: RentHistoryPoint[] | null | undefined,
  currentRent: number,
  from: Date,
  months: number,
): number {
  let total = 0;
  for (let i = 0; i < months; i++) {
    total += resolveExpectedRent(
      history,
      currentRent,
      new Date(from.getFullYear(), from.getMonth() + i, 1),
    );
  }
  return total;
}
