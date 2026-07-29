import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { requireActiveSubscription } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { incomeEntrySchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { getActiveTaxConfigs, matchConfig, buildTaxSnapshot } from "@/lib/tax-engine";

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const unitId = searchParams.get("unitId");
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const filterPropertyId = searchParams.get("propertyId");
  const typeFilter = searchParams.get("type");
  const effectivePropertyIds =
    filterPropertyId && propertyIds.includes(filterPropertyId)
      ? [filterPropertyId]
      : propertyIds;

  // Range params (YYYY-MM-DD, used by period exports) take precedence over the
  // single year+month pair. Parsed component-wise to stay timezone-safe.
  const parseDay = (s: string | null, endOfDay: boolean): Date | null => {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split("-").map(Number);
    return endOfDay ? new Date(y, m - 1, d, 23, 59, 59) : new Date(y, m - 1, d);
  };
  const rangeFrom = parseDay(searchParams.get("from"), false);
  const rangeTo = parseDay(searchParams.get("to"), true);

  let dateFilter = {};
  if (rangeFrom || rangeTo) {
    if (typeFilter === "AIRBNB") {
      dateFilter = {
        ...(rangeTo ? { checkIn: { lte: rangeTo } } : {}),
        ...(rangeFrom ? { checkOut: { gte: rangeFrom } } : {}),
      };
    } else {
      dateFilter = { date: { ...(rangeFrom ? { gte: rangeFrom } : {}), ...(rangeTo ? { lte: rangeTo } : {}) } };
    }
  } else if (year && month) {
    const from = new Date(parseInt(year), parseInt(month) - 1, 1);
    const to = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59);
    // For Airbnb entries filter by booking overlap (checkIn ≤ monthEnd AND checkOut ≥ monthStart)
    // so cross-month bookings appear in every month they span.
    // For all other types filter by the record's date field.
    if (typeFilter === "AIRBNB") {
      dateFilter = { checkIn: { lte: to }, checkOut: { gte: from } };
    } else {
      dateFilter = { date: { gte: from, lte: to } };
    }
  }

  // Exports may raise the row cap explicitly (bounded so it can't be abused).
  const take = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "2000") || 2000, 1), 20000);

  const entries = await prisma.incomeEntry.findMany({
    where: {
      unit: { propertyId: { in: effectivePropertyIds } },
      ...(unitId ? { unitId } : {}),
      ...(typeFilter ? { type: typeFilter as never } : {}),
      ...dateFilter,
    },
    include: {
      unit: { include: { property: { select: { name: true } } } },
      tenant: { select: { id: true, name: true } },
      invoice: { select: { id: true, invoiceNumber: true } },
    },
    orderBy: { date: "desc" },
    // Safety cap — the UI always month-filters; exports pass ?limit= to raise it.
    take,
  });

  return Response.json(entries);
}

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;
  const locked = await requireActiveSubscription(session!.user.organizationId);
  if (locked) return locked;

  const body = await req.json();
  const parsed = incomeEntrySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { date, checkIn, checkOut, tenantId, invoiceId, ...rest } = parsed.data;

  // Resolve property + org for tax lookup
  const unitWithProperty = await prisma.unit.findUnique({
    where: { id: rest.unitId },
    select: { propertyId: true, property: { select: { organizationId: true } } },
  });
  const propertyId = unitWithProperty?.propertyId ?? null;
  const orgId = unitWithProperty?.property?.organizationId ?? session!.user.organizationId ?? null;

  // Auto-link the active tenant if not explicitly provided and type is long-term
  let resolvedTenantId = tenantId ?? null;
  if (!resolvedTenantId && rest.type === "LONGTERM_RENT") {
    const activeTenant = await prisma.tenant.findFirst({
      where: { unitId: rest.unitId, isActive: true },
      select: { id: true },
    });
    resolvedTenantId = activeTenant?.id ?? null;
  }

  // If no invoiceId provided, try to find a matching open invoice for this tenant/month
  let resolvedInvoiceId = invoiceId ?? null;
  if (!resolvedInvoiceId && resolvedTenantId && rest.type === "LONGTERM_RENT") {
    const entryDate = new Date(date);
    const matchingInvoice = await prisma.invoice.findFirst({
      where: {
        tenantId: resolvedTenantId,
        periodYear: entryDate.getFullYear(),
        periodMonth: entryDate.getMonth() + 1,
        status: { in: ["DRAFT", "SENT", "OVERDUE"] },
      },
      select: { id: true },
    });
    resolvedInvoiceId = matchingInvoice?.id ?? null;
  }

  // Tax snapshot — skip if tenant is exempt or no property/org context
  let taxSnapshot = { taxConfigId: null as string | null, taxRate: null as number | null, taxAmount: null as number | null, taxType: null as any };
  if (propertyId && orgId) {
    const tenant = resolvedTenantId
      ? await prisma.tenant.findUnique({ where: { id: resolvedTenantId }, select: { isTaxExempt: true } })
      : null;
    if (!tenant?.isTaxExempt) {
      const configs = await getActiveTaxConfigs(propertyId, orgId);
      const matched = matchConfig(configs, rest.type as string);
      taxSnapshot = buildTaxSnapshot(rest.grossAmount, matched);
    }
  }

  // Array-form $transaction — callback form is pgBouncer-incompatible (see CLAUDE.md).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops: any[] = [
    prisma.incomeEntry.create({
      data: {
        ...rest,
        tenantId: resolvedTenantId,
        invoiceId: resolvedInvoiceId,
        date: new Date(date),
        checkIn: checkIn ? new Date(checkIn) : null,
        checkOut: checkOut ? new Date(checkOut) : null,
        ...taxSnapshot,
      },
      include: {
        unit: { include: { property: { select: { name: true } } } },
        tenant: { select: { id: true, name: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
      },
    }),
  ];
  if (resolvedInvoiceId) {
    ops.push(
      prisma.invoice.update({
        where: { id: resolvedInvoiceId },
        data: {
          status: "PAID",
          paidAt: new Date(date),
          paidAmount: rest.grossAmount,
        },
      }),
    );
  }
  const txResults = await prisma.$transaction(ops);
  const entry = txResults[0];

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "CREATE",
    resource: "IncomeEntry",
    resourceId: entry.id,
    organizationId: session!.user.organizationId,
    after: { type: entry.type, grossAmount: entry.grossAmount, date: entry.date },
  });

  return Response.json(entry, { status: 201 });
}
