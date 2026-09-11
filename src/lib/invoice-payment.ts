// Paying a tenant invoice that carries more than rent.
//
// An Invoice stores fixed line columns: rentAmount, serviceCharge,
// otherCharges, lateFeeAmount (the "rent side") plus the optional move-in
// lines depositAmount, adminFee and leaseFee. When money arrives against the
// invoice it must be booked as TYPED income entries, otherwise a 77,000
// move-in payment (25,000 rent + 50,000 deposit + 2,000 lease fee) reads as
// 77,000 of rent: the deposit inflates gross income and the management-fee
// base, and the deposit-held trail (src/lib/deposit.ts) never sees it.
//
// Allocation order for a payment: rent side first (one LONGTERM_RENT entry —
// rent + service charge + other + late fee stay lumped because the rent
// ledger, src/lib/rent-ledger.ts, counts only LONGTERM_RENT against expected
// rent + service charge), then DEPOSIT, then ADMIN_FEE, then LEASE_FEE. A
// short payment leaves the tail lines unpaid; the next payment continues
// from where the previous ones stopped (`alreadyPaid` walks the same order).
//
// Pure module — the Prisma side lives in src/lib/invoice-payment-entries.ts.

export type InvoicePaymentType = "LONGTERM_RENT" | "DEPOSIT" | "ADMIN_FEE" | "LEASE_FEE";

export interface InvoiceLinesLike {
  rentAmount: number;
  serviceCharge?: number | null;
  otherCharges?: number | null;
  lateFeeAmount?: number | null;
  depositAmount?: number | null;
  adminFee?: number | null;
  leaseFee?: number | null;
}

export interface PaymentAllocation {
  type: InvoicePaymentType;
  amount: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Rent-side total: everything that is booked as LONGTERM_RENT when paid. */
export function invoiceRentSide(inv: InvoiceLinesLike): number {
  return (
    (inv.rentAmount ?? 0) +
    (inv.serviceCharge ?? 0) +
    (inv.otherCharges ?? 0) +
    (inv.lateFeeAmount ?? 0)
  );
}

/** Sum of every line — what Invoice.totalAmount must equal. */
export function invoiceLinesTotal(inv: InvoiceLinesLike): number {
  return round2(
    invoiceRentSide(inv) + (inv.depositAmount ?? 0) + (inv.adminFee ?? 0) + (inv.leaseFee ?? 0),
  );
}

/** True when the invoice carries any non-rent line (deposit / fees). */
export function invoiceHasMoveInLines(inv: InvoiceLinesLike): boolean {
  return (inv.depositAmount ?? 0) > 0 || (inv.adminFee ?? 0) > 0 || (inv.leaseFee ?? 0) > 0;
}

/**
 * The ordered buckets a payment fills. Zero-amount lines are skipped so a
 * plain rent invoice yields exactly one LONGTERM_RENT bucket (today's
 * behaviour, unchanged).
 */
export function invoicePaymentBuckets(inv: InvoiceLinesLike): PaymentAllocation[] {
  const buckets: PaymentAllocation[] = [];
  const rentSide = invoiceRentSide(inv);
  if (rentSide > 0) buckets.push({ type: "LONGTERM_RENT", amount: round2(rentSide) });
  if ((inv.depositAmount ?? 0) > 0) buckets.push({ type: "DEPOSIT", amount: round2(inv.depositAmount!) });
  if ((inv.adminFee ?? 0) > 0) buckets.push({ type: "ADMIN_FEE", amount: round2(inv.adminFee!) });
  if ((inv.leaseFee ?? 0) > 0) buckets.push({ type: "LEASE_FEE", amount: round2(inv.leaseFee!) });
  return buckets;
}

/**
 * Split `amount` across the invoice's lines, continuing after what
 * `alreadyPaid` (sum of previous payments) has covered. Any amount beyond
 * the invoice total is attributed to the LAST bucket (an overpayment on a
 * rent-only invoice is still rent, as before). Returns only non-zero parts.
 */
export function allocateInvoicePayment(
  inv: InvoiceLinesLike,
  amount: number,
  alreadyPaid = 0,
): PaymentAllocation[] {
  const buckets = invoicePaymentBuckets(inv);
  if (buckets.length === 0 || amount <= 0) {
    return amount > 0 ? [{ type: "LONGTERM_RENT", amount: round2(amount) }] : [];
  }
  let consumed = Math.max(alreadyPaid, 0);
  let remaining = amount;
  const out: PaymentAllocation[] = [];

  for (const b of buckets) {
    if (remaining <= 0) break;
    const openInBucket = Math.max(b.amount - consumed, 0);
    consumed = Math.max(consumed - b.amount, 0);
    if (openInBucket <= 0) continue;
    const part = Math.min(openInBucket, remaining);
    out.push({ type: b.type, amount: round2(part) });
    remaining = round2(remaining - part);
  }

  if (remaining > 0) {
    // Overpayment: fold into the last bucket rather than inventing a line.
    const last = out[out.length - 1] ?? { type: buckets[buckets.length - 1].type, amount: 0 };
    if (out.length === 0) out.push(last);
    last.amount = round2(last.amount + remaining);
  }
  return out;
}

/** Human summary for toasts: "rent 25,000 · deposit 50,000 · lease fee 2,000". */
export function describeAllocation(parts: PaymentAllocation[], fmt: (n: number) => string): string {
  const label: Record<InvoicePaymentType, string> = {
    LONGTERM_RENT: "rent",
    DEPOSIT: "deposit",
    ADMIN_FEE: "admin fee",
    LEASE_FEE: "lease fee",
  };
  return parts.map((p) => `${label[p.type]} ${fmt(p.amount)}`).join(" · ");
}
