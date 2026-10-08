// Payment receipts — pure helpers.
//
// A receipt covers ONE payment event. Paying a multi-line invoice creates one
// typed IncomeEntry per line in the same transaction (src/lib/invoice-payment.ts),
// so entries are grouped back into a single receipt: same invoice + same
// calendar day (`receiptGroupKey`), split into separate payments where the
// rows were recorded more than PAYMENT_EVENT_GAP_MS apart (`splitPaymentEvents`)
// — a second payment the same day is its own receipt with its own number.
// Stand-alone entries (a deposit logged on the Income page, a rent payment
// with no invoice) are their own receipt.
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
  /** Set on UTILITY_RECOVERY entries: which metered utility was paid. */
  utilityType?: string | null;
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

/** One payment's rows are created together, within a request; rows on the
 *  same invoice and day recorded further apart than this are separate payments. */
export const PAYMENT_EVENT_GAP_MS = 60_000;

function createdMs(e: Pick<ReceiptableEntry, "createdAt">): number {
  return e.createdAt ? new Date(e.createdAt).getTime() : 0;
}

function byCreation<T extends ReceiptableEntry>(a: T, b: T): number {
  const ca = createdMs(a), cb = createdMs(b);
  if (ca !== cb) return ca - cb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Split the entries of one invoice-day into payments: a new payment starts
 *  wherever the gap since the previous row exceeds PAYMENT_EVENT_GAP_MS.
 *  Each payment's rows come back in creation order. */
export function splitPaymentEvents<T extends ReceiptableEntry>(entries: T[]): T[][] {
  const sorted = [...entries].sort(byCreation);
  const events: T[][] = [];
  for (const e of sorted) {
    const current = events[events.length - 1];
    if (current && createdMs(e) - createdMs(current[current.length - 1]) <= PAYMENT_EVENT_GAP_MS) current.push(e);
    else events.push([e]);
  }
  return events;
}

/** Entries on the same invoice and day share this key; `splitPaymentEvents`
 *  then separates the payments within it. */
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
  return Array.from(map.entries())
    .flatMap(([key, list]) => splitPaymentEvents(list).map((event) => ({ key, event })))
    .map(({ key, event }) => ({
      key: `${key}:${receiptPrimary(event).id}`,
      primary: receiptPrimary(event),
      entries: event,
      amount: Math.round(event.reduce((s, e) => s + e.grossAmount, 0) * 100) / 100,
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

const UTILITY_LABEL: Record<string, string> = { WATER: "Water", ELECTRICITY: "Electricity", WIFI: "Wi-Fi" };

export function receiptTypeLabel(type: string, utilityType?: string | null): string {
  if (type === "UTILITY_RECOVERY" && utilityType && UTILITY_LABEL[utilityType]) return UTILITY_LABEL[utilityType];
  return TYPE_LABEL[type] ?? "Payment";
}

/**
 * One line per entry. Rent and service charge lines carry the billing period when an invoice
 * period is known ("Rent — September 2026"), else the payment month.
 */
export function receiptLines(
  entries: ReceiptableEntry[],
  invoicePeriod?: { periodYear: number; periodMonth: number } | null,
): ReceiptLine[] {
  return entries.map((e) => {
    let label = receiptTypeLabel(e.type, e.utilityType);
    if (e.type === "LONGTERM_RENT" || e.type === "SERVICE_CHARGE") {
      const d = new Date(e.date);
      const period = invoicePeriod
        ? `${MONTH_NAMES[invoicePeriod.periodMonth - 1]} ${invoicePeriod.periodYear}`
        : `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
      label = `${e.type === "SERVICE_CHARGE" ? "Service charge" : "Rent"} — ${period}`;
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
