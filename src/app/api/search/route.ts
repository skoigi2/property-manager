import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export interface SearchResult {
  id: string;
  type: "tenant" | "property" | "invoice" | "vendor" | "case" | "maintenance" | "expense" | "document";
  title: string;
  subtitle?: string;
  href: string;
}

const PER_GROUP = 5;

/**
 * GET /api/search?q= — global search across core entities, scoped to the
 * caller's accessible properties (and org for vendors). Returns grouped,
 * deep-linked results for the Cmd+K palette.
 */
export async function GET(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return Response.json({ results: [] });

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (propertyIds.length === 0) return Response.json({ results: [] });

  const orgId = session!.user.organizationId;
  const contains = { contains: q, mode: "insensitive" as const };

  const [tenants, properties, invoices, vendors, cases, jobs, expenses, documents] = await Promise.all([
    prisma.tenant.findMany({
      where: {
        unit: { propertyId: { in: propertyIds } },
        OR: [{ name: contains }, { email: contains }, { phone: contains }],
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        unit: { select: { unitNumber: true, property: { select: { name: true } } } },
      },
      orderBy: { isActive: "desc" },
      take: PER_GROUP,
    }),
    prisma.property.findMany({
      where: { id: { in: propertyIds }, name: contains },
      select: { id: true, name: true, type: true },
      take: PER_GROUP,
    }),
    prisma.invoice.findMany({
      where: {
        tenant: { unit: { propertyId: { in: propertyIds } } },
        invoiceNumber: contains,
      },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        tenant: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: PER_GROUP,
    }),
    orgId
      ? prisma.vendor.findMany({
          where: { organizationId: orgId, name: contains },
          select: { id: true, name: true, category: true, isActive: true },
          take: PER_GROUP,
        })
      : Promise.resolve([]),
    prisma.caseThread.findMany({
      where: { propertyId: { in: propertyIds }, title: contains },
      select: { id: true, title: true, status: true, caseType: true },
      orderBy: { lastActivityAt: "desc" },
      take: PER_GROUP,
    }),
    prisma.maintenanceJob.findMany({
      where: {
        propertyId: { in: propertyIds },
        OR: [{ title: contains }, { description: contains }],
      },
      select: {
        id: true,
        title: true,
        status: true,
        caseThreadId: true,
        property: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: PER_GROUP,
    }),
    // Expenses: description / payment reference, property-linked rows via
    // access, property-less (PORTFOLIO) rows via the caller's org.
    prisma.expenseEntry.findMany({
      where: {
        OR: [
          { propertyId: { in: propertyIds } },
          { unit: { propertyId: { in: propertyIds } } },
          ...(orgId ? [{ propertyId: null, unitId: null, organizationId: orgId }] : []),
        ],
        AND: { OR: [{ description: contains }, { paymentReference: contains }] },
      },
      select: {
        id: true,
        description: true,
        category: true,
        amount: true,
        date: true,
        property: { select: { name: true, currency: true } },
        unit: { select: { unitNumber: true, property: { select: { name: true, currency: true } } } },
      },
      orderBy: { date: "desc" },
      take: PER_GROUP,
    }),
    // Tenant documents by file name — "find that plumber receipt from March".
    prisma.tenantDocument.findMany({
      where: {
        tenant: { unit: { propertyId: { in: propertyIds } } },
        fileName: contains,
      },
      select: {
        id: true,
        fileName: true,
        category: true,
        tenantId: true,
        tenant: { select: { name: true } },
      },
      orderBy: { uploadedAt: "desc" },
      take: PER_GROUP,
    }),
  ]);

  const results: SearchResult[] = [
    ...tenants.map((t) => ({
      id: t.id,
      type: "tenant" as const,
      title: t.name,
      subtitle: `${t.unit.property.name} · ${t.unit.unitNumber}${t.isActive ? "" : " · former"}`,
      href: `/tenants/${t.id}`,
    })),
    ...properties.map((p) => ({
      id: p.id,
      type: "property" as const,
      title: p.name,
      subtitle: p.type === "AIRBNB" ? "Short-let property" : "Long-term property",
      href: "/properties",
    })),
    ...invoices.map((i) => ({
      id: i.id,
      type: "invoice" as const,
      title: i.invoiceNumber,
      subtitle: `${i.tenant?.name ?? ""} · ${i.status}`,
      href: "/invoices",
    })),
    ...vendors.map((v) => ({
      id: v.id,
      type: "vendor" as const,
      title: v.name,
      subtitle: `${v.category}${v.isActive ? "" : " · inactive"}`,
      href: "/vendors",
    })),
    ...cases.map((c) => ({
      id: c.id,
      type: "case" as const,
      title: c.title,
      subtitle: `${c.caseType} · ${c.status}`,
      href: `/cases/${c.id}`,
    })),
    ...jobs.map((j) => ({
      id: j.id,
      type: "maintenance" as const,
      title: j.title,
      subtitle: `${j.property.name} · ${j.status}`,
      href: j.caseThreadId ? `/cases/${j.caseThreadId}` : "/maintenance",
    })),
    ...expenses.map((e) => {
      const prop = e.property ?? e.unit?.property ?? null;
      const where = e.unit ? `${prop?.name ?? ""} · ${e.unit.unitNumber}` : prop?.name ?? "Portfolio";
      const dateLabel = new Date(e.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      return {
        id: e.id,
        type: "expense" as const,
        title: e.description ?? e.category,
        subtitle: `${where} · ${dateLabel}`,
        href: "/expenses",
      };
    }),
    ...documents.map((d) => ({
      id: d.id,
      type: "document" as const,
      title: d.fileName,
      subtitle: `${d.tenant.name} · ${d.category.replace(/_/g, " ").toLowerCase()}`,
      href: `/tenants/${d.tenantId}?tab=documents`,
    })),
  ];

  return Response.json({ results });
}
