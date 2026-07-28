import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { buildAgingSnapshot, emptyBuckets } from "@/lib/arrears-aging";

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

  // ── Outstanding invoices (aging) — shared snapshot ───────────────────────────
  const aging = await buildAgingSnapshot(effectivePropertyIds);

  // Open arrears cases for these tenants → flag rows
  const tenantIds = aging.rows.map((r) => r.tenantId);
  const openCases = tenantIds.length
    ? await prisma.arrearsCase.findMany({
        where: { tenantId: { in: tenantIds }, stage: { not: "RESOLVED" } },
        select: { id: true, tenantId: true },
      })
    : [];
  const caseByTenant = new Map(openCases.map((c) => [c.tenantId, c.id]));

  const rows = aging.rows.map((r) => ({
    ...r,
    hasOpenCase: caseByTenant.has(r.tenantId),
    openCaseId: caseByTenant.get(r.tenantId) ?? null,
  }));

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
    summary: { totalOutstanding: aging.totalOutstanding, totalCount: aging.totalCount, buckets: aging.buckets },
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
