import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

// Invoice statuses that represent money still owed.
const UNPAID_STATUSES = ["SENT", "OVERDUE", "PENDING_VERIFICATION"] as const;

type Bucket = "current" | "d1_30" | "d31_60" | "d61_90" | "d90plus";

function bucketFor(ageDays: number): Bucket {
  if (ageDays <= 0) return "current";
  if (ageDays <= 30) return "d1_30";
  if (ageDays <= 60) return "d31_60";
  if (ageDays <= 90) return "d61_90";
  return "d90plus";
}

const MS_PER_DAY = 86_400_000;

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const filterPropertyId = searchParams.get("propertyId");
  const months = Math.min(Math.max(Number(searchParams.get("months") ?? 6), 1), 12);

  const effectivePropertyIds =
    filterPropertyId && propertyIds.includes(filterPropertyId)
      ? [filterPropertyId]
      : propertyIds;

  if (effectivePropertyIds.length === 0) {
    return Response.json({
      summary: { totalOutstanding: 0, totalCount: 0, buckets: emptyBuckets() },
      rows: [],
      collection: { period: null, billed: 0, collected: 0, rate: null, target: 90, trend: [] },
    });
  }

  const now = new Date();

  // ── Outstanding invoices (aging) ─────────────────────────────────────────────
  const unpaid = await prisma.invoice.findMany({
    where: {
      status: { in: UNPAID_STATUSES as unknown as string[] as never },
      tenant: { unit: { propertyId: { in: effectivePropertyIds } } },
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
  // Group outstanding by tenant
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
    const key = t.id;
    const existing = byTenant.get(key);
    if (existing) {
      existing.outstanding += outstanding;
      existing.invoiceCount += 1;
      if (!existing.oldestDue || new Date(inv.dueDate) < existing.oldestDue) existing.oldestDue = new Date(inv.dueDate);
    } else {
      byTenant.set(key, {
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

  // Open arrears cases for these tenants → flag rows
  const tenantIds = Array.from(byTenant.keys());
  const openCases = tenantIds.length
    ? await prisma.arrearsCase.findMany({
        where: { tenantId: { in: tenantIds }, stage: { not: "RESOLVED" } },
        select: { id: true, tenantId: true },
      })
    : [];
  const caseByTenant = new Map(openCases.map((c) => [c.tenantId, c.id]));

  const rows = Array.from(byTenant.values()).map((r) => {
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
      hasOpenCase: caseByTenant.has(r.tenantId),
      openCaseId: caseByTenant.get(r.tenantId) ?? null,
    };
  }).sort((a, b) => b.oldestAgeDays - a.oldestAgeDays);

  // ── Collection rate (current month + trailing trend) ─────────────────────────
  // Billed = non-cancelled invoices for the period; Collected = PAID invoices' paidAmount.
  const periodInvoices = await prisma.invoice.findMany({
    where: {
      tenant: { unit: { propertyId: { in: effectivePropertyIds } } },
      status: { not: "CANCELLED" },
    },
    select: { periodYear: true, periodMonth: true, totalAmount: true, paidAmount: true, status: true },
  });

  function rateFor(year: number, month: number) {
    const rows = periodInvoices.filter((i) => i.periodYear === year && i.periodMonth === month);
    const billed = rows.reduce((s, i) => s + i.totalAmount, 0);
    const collected = rows.filter((i) => i.status === "PAID").reduce((s, i) => s + (i.paidAmount ?? i.totalAmount), 0);
    return { billed, collected, rate: billed > 0 ? (collected / billed) * 100 : null };
  }

  const trend: { year: number; month: number; billed: number; collected: number; rate: number | null }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear(); const m = d.getMonth() + 1;
    trend.push({ year: y, month: m, ...rateFor(y, m) });
  }
  const current = rateFor(now.getFullYear(), now.getMonth() + 1);

  // Collection target from the (single-property) agreement, mirroring /api/compliance.
  const agreementPropertyId =
    filterPropertyId && propertyIds.includes(filterPropertyId) ? filterPropertyId : effectivePropertyIds[0];
  const agreement = await prisma.managementAgreement.findUnique({
    where: { propertyId: agreementPropertyId },
    select: { kpiRentCollectionTarget: true },
  });

  return Response.json({
    summary: { totalOutstanding: Math.round(totalOutstanding * 100) / 100, totalCount: rows.length, buckets },
    rows,
    collection: {
      period: { year: now.getFullYear(), month: now.getMonth() + 1 },
      billed: current.billed,
      collected: current.collected,
      rate: current.rate,
      target: agreement?.kpiRentCollectionTarget ?? 90,
      trend,
    },
  });
}

function emptyBuckets(): Record<Bucket, { amount: number; count: number }> {
  return {
    current: { amount: 0, count: 0 },
    d1_30: { amount: 0, count: 0 },
    d31_60: { amount: 0, count: 0 },
    d61_90: { amount: 0, count: 0 },
    d90plus: { amount: 0, count: 0 },
  };
}
