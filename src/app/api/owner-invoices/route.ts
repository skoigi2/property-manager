import { requireManager, requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { ownerInvoiceCreateSchema, type OwnerInvoiceLineItem } from "@/lib/validations";

function generateOwnerInvoiceNumber(year: number, month: number, seq: number) {
  const mm = String(month).padStart(2, "0");
  const nn = String(seq).padStart(4, "0");
  return `OWN-${year}${mm}-${nn}`;
}

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const filterPropertyId = searchParams.get("propertyId");
  const yearParam   = searchParams.get("year");
  const monthParam  = searchParams.get("month");
  const typeParam   = searchParams.get("type");
  const statusParam = searchParams.get("status");

  const effectivePropertyIds =
    filterPropertyId && propertyIds.includes(filterPropertyId)
      ? [filterPropertyId]
      : propertyIds;

  const invoices = await prisma.ownerInvoice.findMany({
    where: {
      propertyId: { in: effectivePropertyIds },
      ...(yearParam  ? { periodYear:  Number(yearParam)  } : {}),
      ...(monthParam ? { periodMonth: Number(monthParam) } : {}),
      ...(typeParam  ? { type: typeParam as never }       : {}),
      ...(statusParam ? { status: statusParam as never }  : {}),
    },
    include: {
      property: { select: { name: true } },
      owner:    { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(invoices);
}

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = ownerInvoiceCreateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { propertyId, type, periodYear, periodMonth, lineItems, dueDate, notes } = parsed.data;

  if (!propertyIds.includes(propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { ownerId: true },
  });

  const totalAmount = (lineItems as OwnerInvoiceLineItem[]).reduce((s, i) => s + i.amount, 0);

  // Sequential number within this month
  const existingCount = await prisma.ownerInvoice.count({
    where: { periodYear, periodMonth },
  });
  const invoiceNumber = generateOwnerInvoiceNumber(periodYear, periodMonth, existingCount + 1);

  const invoice = await prisma.ownerInvoice.create({
    data: {
      invoiceNumber,
      propertyId,
      ownerId:    property?.ownerId ?? null,
      type,
      periodYear,
      periodMonth,
      lineItems:   lineItems as never,
      totalAmount,
      dueDate:     new Date(dueDate),
      notes:       notes ?? null,
      status:      "DRAFT",
    },
    include: {
      property: { select: { name: true } },
      owner:    { select: { name: true, email: true } },
    },
  });

  await logAudit({
    userId:    session!.user.id,
    userEmail: session!.user.email,
    action:    "CREATE",
    resource:  "OwnerInvoice",
    resourceId: invoice.id,
    organizationId: session!.user.organizationId,
    after: { invoiceNumber, type, totalAmount },
  });

  return Response.json(invoice, { status: 201 });
}
