import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { incomeEntrySchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const unitId = searchParams.get("unitId");
  const year = searchParams.get("year");
  const month = searchParams.get("month");

  let dateFilter = {};
  if (year && month) {
    const from = new Date(parseInt(year), parseInt(month) - 1, 1);
    const to = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59);
    dateFilter = { date: { gte: from, lte: to } };
  }

  const entries = await prisma.incomeEntry.findMany({
    where: {
      unit: { propertyId: { in: propertyIds } },
      ...(unitId ? { unitId } : {}),
      ...dateFilter,
    },
    include: {
      unit: { include: { property: { select: { name: true } } } },
      tenant: { select: { id: true, name: true } },
      invoice: { select: { id: true, invoiceNumber: true } },
    },
    orderBy: { date: "desc" },
  });

  return Response.json(entries);
}

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;

  const body = await req.json();
  const parsed = incomeEntrySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { date, checkIn, checkOut, tenantId, invoiceId, ...rest } = parsed.data;

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

  const entry = await prisma.$transaction(async (tx) => {
    const newEntry = await tx.incomeEntry.create({
      data: {
        ...rest,
        tenantId: resolvedTenantId,
        invoiceId: resolvedInvoiceId,
        date: new Date(date),
        checkIn: checkIn ? new Date(checkIn) : null,
        checkOut: checkOut ? new Date(checkOut) : null,
      },
      include: {
        unit: { include: { property: { select: { name: true } } } },
        tenant: { select: { id: true, name: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
      },
    });

    // Auto-mark the linked invoice as PAID
    if (resolvedInvoiceId) {
      await tx.invoice.update({
        where: { id: resolvedInvoiceId },
        data: {
          status: "PAID",
          paidAt: new Date(date),
          paidAmount: rest.grossAmount,
        },
      });
    }

    return newEntry;
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "CREATE",
    resource: "IncomeEntry",
    resourceId: entry.id,
    after: { type: entry.type, grossAmount: entry.grossAmount, date: entry.date },
  });

  return Response.json(entry, { status: 201 });
}
