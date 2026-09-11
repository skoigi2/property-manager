// Lease preparation fee recovery — pure helpers.
//
// The tenant pays the lease agreement (preparation) fee into the LANDLORD's
// account (a LEASE_FEE income entry on the tenant). The manager prepared the
// lease, so the fee is recovered from the owner on the next monthly
// management-fee invoice as a pass-through line (no tax on it). Tracking key:
// the owner-invoice line's `refIncomeEntryId` → the tenant's LEASE_FEE entry.
// A fee is "recovered" once a non-cancelled owner invoice carries that line,
// and "settled" once that invoice is PAID. Removing the line from a draft
// makes the fee pending again, so the next generation picks it up.

export interface LeaseFeeEntry {
  id: string;
  date: Date | string;
  grossAmount: number;
  unitId?: string | null;
  tenantId?: string | null;
  tenantName?: string | null;
  unitNumber?: string | null;
  propertyId?: string | null;
  propertyName?: string | null;
}

export interface RecoveryOwnerInvoice {
  id: string;
  invoiceNumber: string;
  status: string;
  periodYear?: number;
  periodMonth?: number;
  lineItems: unknown;
}

export interface RecoveryLineItem {
  description: string;
  amount: number;
  unitId: string | null;
  tenantId: null;
  incomeType: "OTHER";
  refIncomeEntryId: string;
  refTenantId: string | null;
  isRecovery: true;
}

function lines(inv: RecoveryOwnerInvoice): { refIncomeEntryId?: string | null }[] {
  return Array.isArray(inv.lineItems) ? (inv.lineItems as { refIncomeEntryId?: string | null }[]) : [];
}

/** entryId → the owner invoice that recovers it (non-cancelled invoices only). */
export function recoveryIndex(ownerInvoices: RecoveryOwnerInvoice[]): Map<string, RecoveryOwnerInvoice> {
  const map = new Map<string, RecoveryOwnerInvoice>();
  for (const inv of ownerInvoices) {
    if (inv.status === "CANCELLED") continue;
    for (const li of lines(inv)) {
      if (li.refIncomeEntryId && !map.has(li.refIncomeEntryId)) map.set(li.refIncomeEntryId, inv);
    }
  }
  return map;
}

/** Fees received from tenants that no owner invoice recovers yet. */
export function pendingLeaseFeeRecoveries<T extends LeaseFeeEntry>(entries: T[], ownerInvoices: RecoveryOwnerInvoice[]): T[] {
  const index = recoveryIndex(ownerInvoices);
  return entries.filter((e) => !index.has(e.id));
}

export function recoveryLineItem(entry: LeaseFeeEntry, fmt: (n: number) => string): RecoveryLineItem {
  const who = [entry.tenantName, entry.unitNumber ? `Unit ${entry.unitNumber}` : null].filter(Boolean).join(", ");
  const when = new Date(entry.date);
  const dateLabel = Number.isNaN(when.getTime()) ? "" : ` (received ${when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })})`;
  return {
    description: `Lease preparation fee recovery — ${who || "tenant"}${dateLabel}: ${fmt(entry.grossAmount)}`,
    amount: entry.grossAmount,
    unitId: entry.unitId ?? null,
    // Owner income to the manager, never a tenant payment.
    tenantId: null,
    incomeType: "OTHER",
    refIncomeEntryId: entry.id,
    refTenantId: entry.tenantId ?? null,
    isRecovery: true,
  };
}

export type RecoveryRowState = "PENDING" | "INVOICED" | "SETTLED";

export interface RecoveryRow extends LeaseFeeEntry {
  state: RecoveryRowState;
  ownerInvoiceId: string | null;
  ownerInvoiceNumber: string | null;
}

export interface LeaseFeeRecoveryStatus {
  /** Σ LEASE_FEE received from tenants. */
  collected: number;
  /** Σ on a non-cancelled owner invoice (any status). */
  invoiced: number;
  /** Σ on a PAID owner invoice. */
  settled: number;
  /** collected − invoiced: not yet billed to the owner. */
  pending: number;
  rows: RecoveryRow[];
}

/** Collected vs invoiced vs settled — the reconciliation the Owner Invoices tab shows. */
export function leaseFeeRecoveryStatus(entries: LeaseFeeEntry[], ownerInvoices: RecoveryOwnerInvoice[]): LeaseFeeRecoveryStatus {
  const index = recoveryIndex(ownerInvoices);
  const rows: RecoveryRow[] = entries.map((e) => {
    const inv = index.get(e.id) ?? null;
    const state: RecoveryRowState = !inv ? "PENDING" : inv.status === "PAID" ? "SETTLED" : "INVOICED";
    return { ...e, state, ownerInvoiceId: inv?.id ?? null, ownerInvoiceNumber: inv?.invoiceNumber ?? null };
  });
  const sum = (f: (r: RecoveryRow) => boolean) => Math.round(rows.filter(f).reduce((s, r) => s + r.grossAmount, 0) * 100) / 100;
  const collected = sum(() => true);
  const invoiced = sum((r) => r.state !== "PENDING");
  return {
    collected,
    invoiced,
    settled: sum((r) => r.state === "SETTLED"),
    pending: Math.round((collected - invoiced) * 100) / 100,
    rows: rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  };
}
