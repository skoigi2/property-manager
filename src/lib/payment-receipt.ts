// Payment receipts — pure helpers.
//
// A receipt covers ONE payment event. Paying a multi-line invoice creates one
// typed IncomeEntry per line in the same transaction (src/lib/invoice-payment.ts),
// so entries are grouped back into a single receipt by `receiptGroupKey`:
// same invoice + same calendar day. Stand-alone entries (a deposit logged on
// the Income page, a rent payment with no invoice) are their own receipt.
//
// Nothing is stored: the receipt number is derived from the group's primary
// (earliest-created) entry, so the same payment always renders the same
// number, and no counter table is needed.

export type ReceiptableEntry = {
  id: string;
  date: Date | string;
  type: string;
  grossAmount: number;
  invoiceId?: string | null;
  createdAt?: Date | string | null;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ymd(d: Date | string): string {
  const x = new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${x.getFullYear()}-${m}-${day}`;
}

/** Entries sharing a key are one payment event → one receipt. */
export function receiptGroupKey(entry: Pick<ReceiptableEntry, "id" | "date" | "invoiceId">): string {
  return entry.invoiceId ? `${entry.invoiceId}:${ymd(entry.date)}` : entry.id;
}

/** The entry whose id names the receipt: earliest created, then lowest id (stable). */
export function receiptPrimary<T extends ReceiptableEntry>(entries: T[]): T {
  return [...entries].sort((a, b) => {
    const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (ca !== cb) return ca - cb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];
}

/** RCPT-YYYYMMDD-XXXXXX — date of payment + last 6 chars of the primary id. */
export function receiptNumberFor(primary: Pick<ReceiptableEntry, "id" | "date">): string {
  const suffix = primary.id.slice(-6).toUpperCase();
  return `RCPT-${ymd(primary.date).replace(/-/g, "")}-${suffix}`;
}

/** Group a flat list of a tenant's entries into receipt groups, newest first. */
export function groupReceipts<T extends ReceiptableEntry>(entries: T[]): { key: string; primary: T; entries: T[]; amount: number }[] {
  const map = new Map<string, T[]>();
  for (const e of entries) {
    const k = receiptGroupKey(e);
    const list = map.get(k);
    if (list) list.push(e);
    else map.set(k, [e]);
  }
  // Lines in creation order (rent side → deposit → fees, as the allocator
  // creates them), regardless of how the caller's query happened to sort.
  const byCreation = (a: T, b: T) => {
    const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (ca !== cb) return ca - cb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
  return Array.from(map.entries())
    .map(([key, list]) => ({
      key,
      primary: receiptPrimary(list),
      entries: [...list].sort(byCreation),
      amount: Math.round(list.reduce((s, e) => s + e.grossAmount, 0) * 100) / 100,
    }))
    .sort((a, b) => new Date(b.primary.date).getTime() - new Date(a.primary.date).getTime());
}

export interface ReceiptLine {
  label: string;
  amount: number;
}

const TYPE_LABEL: Record<string, string> = {
  LONGTERM_RENT: "Rent",
  SERVICE_CHARGE: "Service charge",
  DEPOSIT: "Refundable security deposit",
  LEASE_FEE: "Lease agreement fee",
  UTILITY_RECOVERY: "Utilities",
  AIRBNB: "Stay",
  OTHER: "Other charges",
};

export function receiptTypeLabel(type: string): string {
  return TYPE_LABEL[type] ?? "Payment";
}

/**
 * One line per entry. Rent lines carry the billing period when an invoice
 * period is known ("Rent — September 2026"), else the payment month.
 */
export function receiptLines(
  entries: ReceiptableEntry[],
  invoicePeriod?: { periodYear: number; periodMonth: number } | null,
): ReceiptLine[] {
  return entries.map((e) => {
    let label = receiptTypeLabel(e.type);
    if (e.type === "LONGTERM_RENT") {
      const d = new Date(e.date);
      const period = invoicePeriod
        ? `${MONTH_NAMES[invoicePeriod.periodMonth - 1]} ${invoicePeriod.periodYear}`
        : `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
      label = `Rent — ${period}`;
    }
    return { label, amount: e.grossAmount };
  });
}

/** Short subject/description: "Rent — September 2026" or "Rent + deposit + lease agreement fee". */
export function receiptDescription(lines: ReceiptLine[]): string {
  if (lines.length === 1) return lines[0].label;
  const short = lines.map((l) => (l.label.startsWith("Rent") ? "rent" : l.label.toLowerCase().replace("refundable security ", "")));
  const joined = short.join(" + ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

export interface ReceiptStamp {
  headline: string;
  sub: string;
}

/**
 * "PAID IN FULL" only when the linked invoice is settled after this payment
 * (≥ 99 % of the total — the same tolerance POST /api/income uses to flip an
 * invoice to PAID). Stand-alone payments (no invoice) are complete by definition.
 */
export function receiptStamp(opts: {
  invoice?: { totalAmount: number; paidToDate: number } | null;
}): ReceiptStamp {
  const inv = opts.invoice;
  if (!inv || inv.paidToDate >= inv.totalAmount * 0.99) {
    return { headline: "RECEIVED — PAID IN FULL", sub: "Thank you for your payment" };
  }
  return { headline: "RECEIVED — PART PAYMENT", sub: "Thank you — a balance remains on this invoice" };
}
