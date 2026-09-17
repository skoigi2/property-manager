// Paying a tenant invoice that carries more than rent.
//
// An Invoice stores fixed line columns: rentAmount, serviceCharge,
// otherCharges, lateFeeAmount (the "rent side") plus the metered utility lines
// waterAmount / electricityAmount and the optional move-in lines
// depositAmount and leaseFee. When money arrives against the
// invoice it must be booked as TYPED income entries, otherwise a 77,000
// move-in payment (25,000 rent + 50,000 deposit + 2,000 lease fee) reads as
// 77,000 of rent: the deposit inflates gross income and the management-fee
// base, and the deposit-held trail (src/lib/deposit.ts) never sees it.
//
// Allocation order for a payment: rent side first (one LONGTERM_RENT entry —
// rent + service charge + other + late fee stay lumped because the rent
// ledger, src/lib/rent-ledger.ts, counts only LONGTERM_RENT against expected
// rent + service charge), then water, then electricity (UTILITY_RECOVERY
// entries tagged with the utility — never rent, so metered money stays out of
// the rent ledger and the management-fee base), then DEPOSIT, then LEASE_FEE.
// A short payment leaves the tail lines unpaid; the next payment continues
// from where the previous ones stopped (`alreadyPaid` walks the same order).
// Because the walk is fixed, an invoice's utility lines must not change once
// money is booked against it (see canChangeInvoiceUtilities).
//
// Pure module — the Prisma side lives in src/lib/invoice-payment-entries.ts.

export type InvoicePaymentType = "LONGTERM_RENT" | "UTILITY_RECOVERY" | "DEPOSIT" | "LEASE_FEE";
export type InvoiceUtility = "WATER" | "ELECTRICITY";

export interface InvoiceLinesLike {
  rentAmount: number;
  serviceCharge?: number | null;
  otherCharges?: number | null;
  lateFeeAmount?: number | null;
  waterAmount?: number | null;
  electricityAmount?: number | null;
  depositAmount?: number | null;
  leaseFee?: number | null;
}

export interface PaymentAllocation {
  type: InvoicePaymentType;
  amount: number;
  /** Set on UTILITY_RECOVERY parts only. */
  utility?: InvoiceUtility;
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

/** Metered utilities billed on the invoice (water + electricity). */
export function invoiceUtilitiesTotal(inv: InvoiceLinesLike): number {
  return round2((inv.waterAmount ?? 0) + (inv.electricityAmount ?? 0));
}

/** Sum of every line — what Invoice.totalAmount must equal. */
export function invoiceLinesTotal(inv: InvoiceLinesLike): number {
  return round2(
    invoiceRentSide(inv) +
      (inv.waterAmount ?? 0) +
      (inv.electricityAmount ?? 0) +
      (inv.depositAmount ?? 0) +
      (inv.leaseFee ?? 0),
  );
}

/** True when the invoice carries a move-in line (deposit / lease fee). */
export function invoiceHasMoveInLines(inv: InvoiceLinesLike): boolean {
  return (inv.depositAmount ?? 0) > 0 || (inv.leaseFee ?? 0) > 0;
}

/**
 * True when a payment against the invoice must be split into typed entries
 * (any line outside the rent side: utilities, deposit, lease fee). A payment
 * booked as one LONGTERM_RENT row on such an invoice would over-credit the
 * rent ledger and the management-fee base.
 */
export function invoiceHasNonRentLines(inv: InvoiceLinesLike): boolean {
  return invoiceHasMoveInLines(inv) || invoiceUtilitiesTotal(inv) > 0;
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
  if ((inv.waterAmount ?? 0) > 0) buckets.push({ type: "UTILITY_RECOVERY", utility: "WATER", amount: round2(inv.waterAmount!) });
  if ((inv.electricityAmount ?? 0) > 0) buckets.push({ type: "UTILITY_RECOVERY", utility: "ELECTRICITY", amount: round2(inv.electricityAmount!) });
  if ((inv.depositAmount ?? 0) > 0) buckets.push({ type: "DEPOSIT", amount: round2(inv.depositAmount!) });
  if ((inv.leaseFee ?? 0) > 0) buckets.push({ type: "LEASE_FEE", amount: round2(inv.leaseFee!) });
  return buckets;
}

/**
 * Split `amount` across the invoice's lines, continuing after what
 * `alreadyPaid` (sum of previous payments) has covered. Any amount beyond
 * the invoice total is attributed to the LAST non-utility bucket (an
 * overpayment on a rent-only invoice is still rent, as before). It is never
 * folded into a utility line — metered income must equal what was metered —
 * so on a utilities-only invoice the excess is booked as a rent credit.
 * Returns only non-zero parts.
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
    out.push({ ...b, amount: round2(part) });
    remaining = round2(remaining - part);
  }

  if (remaining > 0) {
    // Overpayment: fold into the last non-utility part rather than inventing
    // a line; when this payment touched none, open one for the invoice's last
    // non-utility bucket (rent when the invoice has no such bucket at all).
    const isUtility = (p: PaymentAllocation) => p.type === "UTILITY_RECOVERY";
    let target = [...out].reverse().find((p) => !isUtility(p));
    if (!target) {
      const bucket = [...buckets].reverse().find((b) => !isUtility(b));
      target = { type: bucket?.type ?? "LONGTERM_RENT", amount: 0 };
      out.push(target);
    }
    target.amount = round2(target.amount + remaining);
  }
  return out;
}

export interface InvoiceOutstanding {
  /** Rent side: rent + service charge + other charges + late fee. */
  rent: number;
  water: number;
  electricity: number;
  deposit: number;
  leaseFee: number;
  total: number;
}

/**
 * What is still owed on each line after `paid` has walked the buckets in
 * allocation order. Because a short payment always fills rent first, the
 * unpaid tail is where unpaid water / electricity shows up.
 */
export function invoiceOutstandingByBucket(inv: InvoiceLinesLike, paid: number | null | undefined): InvoiceOutstanding {
  const res: InvoiceOutstanding = { rent: 0, water: 0, electricity: 0, deposit: 0, leaseFee: 0, total: 0 };
  let consumed = Math.max(paid ?? 0, 0);
  for (const b of invoicePaymentBuckets(inv)) {
    const open = round2(Math.max(b.amount - consumed, 0));
    consumed = Math.max(consumed - b.amount, 0);
    if (open <= 0) continue;
    if (b.type === "LONGTERM_RENT") res.rent = open;
    else if (b.type === "UTILITY_RECOVERY") {
      if (b.utility === "WATER") res.water = open;
      else res.electricity = open;
    } else if (b.type === "DEPOSIT") res.deposit = open;
    else res.leaseFee = open;
  }
  res.total = round2(res.rent + res.water + res.electricity + res.deposit + res.leaseFee);
  return res;
}

/** Human summary for toasts: "rent 25,000 · water 750 · deposit 50,000". */
export function describeAllocation(parts: PaymentAllocation[], fmt: (n: number) => string): string {
  const label: Record<InvoicePaymentType, string> = {
    LONGTERM_RENT: "rent",
    UTILITY_RECOVERY: "utilities",
    DEPOSIT: "deposit",
    LEASE_FEE: "lease fee",
  };
  const utilityLabel: Record<InvoiceUtility, string> = { WATER: "water", ELECTRICITY: "electricity" };
  return parts
    .map((p) => `${p.utility ? utilityLabel[p.utility] : label[p.type]} ${fmt(p.amount)}`)
    .join(" · ");
}
