// Pure: what a handed-in move-out inspection contributes to the manager's
// checkout form — damage description, keys returned, final meter readings.
// The manager still prices the damage and decides every deduction.

import { normaliseKeys, type InspectionItem } from "@/lib/inspection-rules";

export type CheckoutKeys = { mainDoor: number; bedroom: number; gate: number; mailbox: number };

export interface InspectionCheckoutPrefill {
  /** True when any item is in POOR condition. */
  damageFound: boolean;
  /** One line per POOR / FAIR item: "Kitchen — Sink/Taps (POOR): dripping". */
  damageNotes: string;
  damagedCount: number;
  keysReturned: CheckoutKeys;
  /** Keys the checkout has no box for: "Remote / fob × 1". */
  otherKeys: string[];
  finalMeterReadings: { meterId: string; reading: number }[];
}

const KEY_FIELDS: Record<string, keyof CheckoutKeys> = {
  "main door": "mainDoor",
  "front door": "mainDoor",
  bedroom: "bedroom",
  gate: "gate",
  mailbox: "mailbox",
};

export function checkoutPrefillFromInspection(r: {
  items: unknown;
  keys: unknown;
  meterReadings: unknown;
}): InspectionCheckoutPrefill {
  const items = (Array.isArray(r.items) ? r.items : []) as InspectionItem[];
  const worn = items.filter((i) => i.status === "POOR" || i.status === "FAIR");
  const damageNotes = worn
    .map((i) => `${i.room} — ${i.feature} (${i.status})${i.notes?.trim() ? `: ${i.notes.trim()}` : ""}`)
    .join("\n");

  const keysReturned: CheckoutKeys = { mainDoor: 0, bedroom: 0, gate: 0, mailbox: 0 };
  const otherKeys: string[] = [];
  for (const k of normaliseKeys(r.keys)) {
    const field = KEY_FIELDS[k.label.trim().toLowerCase()];
    if (field) keysReturned[field] += k.count;
    else otherKeys.push(`${k.label} × ${k.count}`);
  }

  const finalMeterReadings = (Array.isArray(r.meterReadings) ? r.meterReadings : [])
    .filter((m): m is { meterId: string; reading: number } =>
      !!m && typeof (m as { meterId?: unknown }).meterId === "string" && typeof (m as { reading?: unknown }).reading === "number")
    .map((m) => ({ meterId: m.meterId, reading: m.reading }));

  return {
    damageFound: items.some((i) => i.status === "POOR"),
    damageNotes,
    damagedCount: worn.length,
    keysReturned,
    otherKeys,
    finalMeterReadings,
  };
}

/**
 * The REINSTATEMENT expense a finalised checkout books for damage the landlord
 * keeps. Repair jobs raised from the move-out inspection book their own cost
 * (their expense), so: no jobs → the whole damage charge; every job has an
 * accepted quote → only what those quotes don't cover; a job without an
 * accepted quote → nothing (its cost is unknown; the manager adds an expense
 * for anything else). Never the same repair twice.
 */
export function damageExpenseFor(inventoryDamage: number, repairJobs: { acceptedQuote: number | null }[]) {
  const coveredByRepairJobs = Math.round(repairJobs.reduce((s, j) => s + (j.acceptedQuote ?? 0), 0) * 100) / 100;
  const unquotedRepairJobs = repairJobs.filter((j) => j.acceptedQuote === null).length;
  const amount = !repairJobs.length
    ? inventoryDamage
    : unquotedRepairJobs > 0
      ? 0
      : Math.max(0, Math.round((inventoryDamage - coveredByRepairJobs) * 100) / 100);
  return { amount, coveredByRepairJobs, unquotedRepairJobs };
}
