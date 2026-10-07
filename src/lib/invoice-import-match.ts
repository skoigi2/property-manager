// Which existing payments a historical invoice row (invoice importer) is paid
// by. Pure — the route pre-filters the pool to the tenant's unclaimed payments
// around the invoice period.

export const RENT_SIDE_TYPES = new Set(["LONGTERM_RENT", "SERVICE_CHARGE", "OTHER"]);

export type ImportPayment = { id: string; grossAmount: number; type: string; utilityType: string | null };

export type ImportInvoiceLines = {
  /** rent + service charge + other charges */
  rentSide: number;
  deposit: number;
  leaseFee: number;
  wifi: number;
};

export type ImportMatch =
  | { outcome: "matched"; ids: string[] }
  | { outcome: "none" }
  /** More than one payment fits a line — left for the manager. */
  | { outcome: "ambiguous" }
  /** One rent-side payment covers the whole invoice, but it would book the deposit / fee / Wi-Fi as rent. */
  | { outcome: "lump" };

const isRentSide = (p: ImportPayment) => RENT_SIDE_TYPES.has(p.type);

/**
 * A rent-only invoice: exactly one rent-side payment for the total. An invoice
 * with deposit / lease fee / Wi-Fi lines: exactly one payment of the right TYPE
 * per line (rent side, DEPOSIT, LEASE_FEE, Wi-Fi utility recovery) — all lines
 * or nothing; a single lump payment is never linked.
 */
export function matchImportedInvoicePayments(pool: ImportPayment[], lines: ImportInvoiceLines): ImportMatch {
  const total = lines.rentSide + lines.deposit + lines.leaseFee + lines.wifi;
  const exactlyOne = (amount: number, fits: (p: ImportPayment) => boolean, taken: Set<string>) => {
    const hits = pool.filter((p) => !taken.has(p.id) && fits(p) && Math.abs(p.grossAmount - amount) < 0.01);
    return hits.length === 1 ? hits[0] : hits.length > 1 ? ("many" as const) : null;
  };
  const none = new Set<string>();

  if (lines.deposit <= 0 && lines.leaseFee <= 0 && lines.wifi <= 0) {
    const hit = exactlyOne(total, isRentSide, none);
    if (hit === "many") return { outcome: "ambiguous" };
    return hit ? { outcome: "matched", ids: [hit.id] } : { outcome: "none" };
  }

  const wanted: [number, (p: ImportPayment) => boolean][] = [
    [lines.rentSide, isRentSide],
    [lines.deposit, (p) => p.type === "DEPOSIT"],
    [lines.leaseFee, (p) => p.type === "LEASE_FEE"],
    [lines.wifi, (p) => p.type === "UTILITY_RECOVERY" && p.utilityType === "WIFI"],
  ];
  const picks = new Set<string>();
  for (const [amount, fits] of wanted) {
    if (amount <= 0) continue;
    const hit = exactlyOne(amount, fits, picks);
    if (hit === "many") return { outcome: "ambiguous" };
    if (!hit) {
      const lump = exactlyOne(total, isRentSide, none);
      return lump && lump !== "many" ? { outcome: "lump" } : { outcome: "none" };
    }
    picks.add(hit.id);
  }
  return { outcome: "matched", ids: [...picks] };
}
