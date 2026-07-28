import { prisma } from "@/lib/prisma";

// Shared arrears-aging snapshot: buckets outstanding invoices by days overdue.
// Used by GET /api/arrears/aging (the /arrears page) and the report builders
// (/report preview + PDF), so the numbers always agree.

/** Invoice statuses that represent money still owed. */
export const UNPAID_INVOICE_STATUSES = ["SENT", "OVERDUE", "PENDING_VERIFICATION"] as const;

export type AgingBucket = "current" | "d1_30" | "d31_60" | "d61_90" | "d90plus";

export const AGING_BUCKET_LABELS: Record<AgingBucket, string> = {
  current: "Current",
  d1_30: "1–30 days",
  d31_60: "31–60 days",
  d61_90: "61–90 days",
  d90plus: "90+ days",
};

export function bucketFor(ageDays: number): AgingBucket {
  if (ageDays <= 0) return "current";
  if (ageDays <= 30) return "d1_30";
  if (ageDays <= 60) return "d31_60";
  if (ageDays <= 90) return "d61_90";
  return "d90plus";
}

export function emptyBuckets(): Record<AgingBucket, { amount: number; count: number }> {
  return {
    current: { amount: 0, count: 0 },
    d1_30: { amount: 0, count: 0 },
    d31_60: { amount: 0, count: 0 },
    d61_90: { amount: 0, count: 0 },
    d90plus: { amount: 0, count: 0 },
  };
}

export interface AgingRow {
  tenantId: string;
  tenantName: string;
  unitNumber: string;
  propertyId: string;
  propertyName: string;
  currency: string;
  phone: string | null;
  email: string | null;
  outstanding: number;
  oldestDueDate: string | null;
  oldestAgeDays: number;
  bucket: AgingBucket;
  invoiceCount: number;
}

export interface AgingSnapshot {
  totalOutstanding: number;
  totalCount: number;
  buckets: Record<AgingBucket, { amount: number; count: number }>;
  rows: AgingRow[];
}

const MS_PER_DAY = 86_400_000;

/** Point-in-time aging of all unpaid invoices across the given properties. */
export async function buildAgingSnapshot(propertyIds: string[]): Promise<AgingSnapshot> {
  if (propertyIds.length === 0) {
    return { totalOutstanding: 0, totalCount: 0, buckets: emptyBuckets(), rows: [] };
  }

  const now = new Date();

  const unpaid = await prisma.invoice.findMany({
    where: {
      status: { in: UNPAID_INVOICE_STATUSES as unknown as string[] as never },
      tenant: { unit: { propertyId: { in: propertyIds } } },
    },
    select: {
      id: true, totalAmount: true, paidAmount: true, dueDate: true,
      tenant: {
        select: {
          id: true, name: true, phone: true, email: true,
          unit: { select: { unitNumber: true, propertyId: true, property: { select: { name: true, currency: true } } } },
        },
      },
    },
  });

  const buckets = emptyBuckets();
  const byTenant = new Map<string, {
    tenantId: string; tenantName: string; unitNumber: string;
    propertyId: string; propertyName: string; currency: string;
    phone: string | null; email: string | null;
    outstanding: number; invoiceCount: number; oldestDue: Date | null;
  }>();

  let totalOutstanding = 0;

  for (const inv of unpaid) {
    const outstanding = inv.totalAmount - (inv.paidAmount ?? 0);
    if (outstanding <= 0) continue;
    const ageDays = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / MS_PER_DAY);
    const b = bucketFor(ageDays);
    buckets[b].amount += outstanding;
    buckets[b].count += 1;
    totalOutstanding += outstanding;

    const t = inv.tenant;
    const existing = byTenant.get(t.id);
    if (existing) {
      existing.outstanding += outstanding;
      existing.invoiceCount += 1;
      if (!existing.oldestDue || new Date(inv.dueDate) < existing.oldestDue) existing.oldestDue = new Date(inv.dueDate);
    } else {
      byTenant.set(t.id, {
        tenantId: t.id,
        tenantName: t.name,
        unitNumber: t.unit?.unitNumber ?? "—",
        propertyId: t.unit?.propertyId ?? "",
        propertyName: t.unit?.property?.name ?? "",
        currency: t.unit?.property?.currency ?? "KES",
        phone: t.phone,
        email: t.email,
        outstanding,
        invoiceCount: 1,
        oldestDue: new Date(inv.dueDate),
      });
    }
  }

  const rows: AgingRow[] = Array.from(byTenant.values()).map((r) => {
    const oldestAgeDays = r.oldestDue
      ? Math.floor((now.getTime() - r.oldestDue.getTime()) / MS_PER_DAY)
      : 0;
    return {
      tenantId: r.tenantId,
      tenantName: r.tenantName,
      unitNumber: r.unitNumber,
      propertyId: r.propertyId,
      propertyName: r.propertyName,
      currency: r.currency,
      phone: r.phone,
      email: r.email,
      outstanding: Math.round(r.outstanding * 100) / 100,
      oldestDueDate: r.oldestDue?.toISOString() ?? null,
      oldestAgeDays,
      bucket: bucketFor(oldestAgeDays),
      invoiceCount: r.invoiceCount,
    };
  }).sort((a, b) => b.oldestAgeDays - a.oldestAgeDays);

  return {
    totalOutstanding: Math.round(totalOutstanding * 100) / 100,
    totalCount: rows.length,
    buckets,
    rows,
  };
}
