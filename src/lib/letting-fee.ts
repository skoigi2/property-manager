// Letting fee — the agent's fee for placing a new tenant, invoiced to the
// owner. The % applies to the tenant's FULL first-month charge: rent plus
// service charge plus any parking fee (the standard tenancy agreement bills
// "rent inclusive of service charge" as one monthly sum), never rent alone.
//
// Pure: shared by POST /api/owner-invoices/generate-letting-fee and the
// Tenants-page "Generate letting fee invoice?" prompt so both quote the same
// figure.

export interface LettingFeeTenant {
  monthlyRent: number | null | undefined;
  serviceCharge?: number | null;
  parkingFee?: number | null;
}

export interface LettingFeeBreakdownLine {
  label: "Rent" | "Service charge" | "Parking";
  amount: number;
}

export interface LettingFeeResult {
  /** rent + service charge + parking (only lines > 0 are listed). */
  base: number;
  ratePercent: number;
  /** base × rate / 100, rounded to 2 dp. */
  amount: number;
  breakdown: LettingFeeBreakdownLine[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function lettingFeeBase(t: LettingFeeTenant): number {
  return (t.monthlyRent ?? 0) + (t.serviceCharge ?? 0) + (t.parkingFee ?? 0);
}

export function calcLettingFee(t: LettingFeeTenant, ratePercent: number): LettingFeeResult {
  const breakdown: LettingFeeBreakdownLine[] = [];
  const rent = t.monthlyRent ?? 0;
  const sc = t.serviceCharge ?? 0;
  const parking = t.parkingFee ?? 0;
  if (rent > 0) breakdown.push({ label: "Rent", amount: rent });
  if (sc > 0) breakdown.push({ label: "Service charge", amount: sc });
  if (parking > 0) breakdown.push({ label: "Parking", amount: parking });
  const base = lettingFeeBase(t);
  return { base, ratePercent, amount: round2((ratePercent / 100) * base), breakdown };
}

/**
 * "50% × KES 25,000 (rent 22,000 + service charge 3,000)" — the invoice line
 * suffix. `fmt` formats a number in the property currency.
 */
export function lettingFeeDescription(result: LettingFeeResult, fmt: (n: number) => string): string {
  const parts = result.breakdown.map((b) => `${b.label.toLowerCase()} ${fmt(b.amount)}`);
  const detail = result.breakdown.length > 1 ? ` (${parts.join(" + ")})` : "";
  return `${result.ratePercent}% × ${fmt(result.base)}${detail}`;
}
