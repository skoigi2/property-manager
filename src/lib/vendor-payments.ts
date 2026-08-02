// Pure helpers for the vendor-payment allocation layer.
//
// RECONCILIATION RULE (the invariant every route must keep):
//   - sum of a payment's allocations <= VendorPayment.amount; the remainder is
//     an unallocated credit sitting on the vendor account.
//   - once an ExpenseEntry has any VendorPaymentAllocation rows,
//     SUM(allocations.amount) IS the expense's paid position — routes overwrite
//     expense.amountPaid with that sum on every allocation create/update/delete
//     so `calcExpensePayment` keeps working and manual amountPaid is never
//     double-counted on top of allocations.
//   - for expenses WITH line items `calcExpensePayment` derives paid from the
//     line items, so the same allocation total is waterfalled across the line
//     items (oldest first) via `waterfallLineItemPayments`.

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface AllocationInput {
  expenseEntryId: string;
  amount: number;
}

export function sumAllocations(allocations: { amount: number }[]): number {
  return round2(allocations.reduce((s, a) => s + a.amount, 0));
}

/**
 * Validates a proposed allocation set against the payment amount.
 * Returns an error string (for a 400 body) or null when valid.
 */
export function validateAllocations(
  paymentAmount: number,
  allocations: AllocationInput[]
): string | null {
  if (!(paymentAmount > 0)) return "Payment amount must be greater than zero";
  const seen = new Set<string>();
  for (const a of allocations) {
    if (!a.expenseEntryId) return "Allocation is missing an expense";
    if (!(a.amount > 0)) return "Allocation amounts must be greater than zero";
    if (seen.has(a.expenseEntryId)) return "Duplicate expense in allocations";
    seen.add(a.expenseEntryId);
  }
  const total = sumAllocations(allocations);
  // Small epsilon so float artifacts (e.g. 3 × 33.33 vs 99.99) don't reject.
  if (total > round2(paymentAmount) + 0.005) {
    return "Allocated total exceeds the payment amount";
  }
  return null;
}

/** Unallocated credit remaining on a payment. Never negative. */
export function unallocatedRemainder(
  paymentAmount: number,
  allocations: { amount: number }[]
): number {
  return round2(Math.max(paymentAmount - sumAllocations(allocations), 0));
}

/**
 * Distributes an expense's allocation-derived paid total across its line items
 * (in the order given — callers pass creation order), because
 * `calcExpensePayment` derives the paid position from line items when they
 * exist. Fully deterministic: each item absorbs up to its own amount.
 */
export function waterfallLineItemPayments(
  lineItems: { id: string; amount: number }[],
  totalPaid: number
): { id: string; amountPaid: number; paymentStatus: "UNPAID" | "PARTIAL" | "PAID" }[] {
  let remaining = round2(Math.max(totalPaid, 0));
  return lineItems.map((li) => {
    const paid = round2(Math.min(li.amount, remaining));
    remaining = round2(remaining - paid);
    const paymentStatus =
      paid <= 0 ? "UNPAID" : paid >= li.amount ? "PAID" : "PARTIAL";
    return { id: li.id, amountPaid: paid, paymentStatus };
  });
}
