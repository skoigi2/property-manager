// Statement-style payment allocation for rent ledgers.
//
// Problem: comparing each month's expected rent against cash received IN that
// month falsely flags tenants who pay quarterly / biannually / annually in
// advance (the payment month shows a huge overpayment, the covered months show
// "Unpaid") and tenants who catch up late (old months stay flagged forever).
//
// Model: all receipts form one pot, and the pot covers months oldest-first —
// exactly how a landlord statement works. A month is PAID when the cumulative
// pot reaches its cumulative expected total, regardless of which calendar month
// the cash physically arrived in. Genuine deficits surface on the most recent
// months ("he is two months behind"), which is the question the ledger answers.
//
// The per-month `received` (raw cash-in) is preserved so views can still show
// when money actually arrived.

export interface LedgerMonthInput {
  /** Rent (+ service charge etc.) expected for this month. */
  expected: number;
  /** Cash actually received during this month. */
  received: number;
}

export interface LedgerMonthAllocation extends LedgerMonthInput {
  /** Portion of `expected` covered by the pooled receipts (oldest-first). */
  allocated: number;
  /** expected − allocated, floored at 0. */
  shortfall: number;
  /** Running balance: cumulative received − cumulative expected through this month. */
  balance: number;
  status: "PAID" | "PARTIAL" | "UNPAID";
}

/** `months` must be in chronological (ascending) order. */
export function allocatePayments(months: LedgerMonthInput[]): LedgerMonthAllocation[] {
  const totalReceived = months.reduce((s, m) => s + m.received, 0);
  let cumExpectedBefore = 0;
  let cumReceived = 0;

  return months.map((m) => {
    const potRemaining = Math.max(0, totalReceived - cumExpectedBefore);
    const allocated = Math.min(m.expected, potRemaining);
    cumExpectedBefore += m.expected;
    cumReceived += m.received;

    const shortfall = Math.max(0, m.expected - allocated);
    // 1% tolerance mirrors the existing `paid >= expected * 0.99` convention.
    const status: LedgerMonthAllocation["status"] =
      m.expected === 0 || allocated >= m.expected * 0.99
        ? "PAID"
        : allocated > 0
          ? "PARTIAL"
          : "UNPAID";

    return {
      ...m,
      allocated,
      shortfall,
      balance: cumReceived - cumExpectedBefore,
      status,
    };
  });
}
