import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { requireActiveSubscription } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { format } from "date-fns";

const createSchema = z.object({
  tenantId: z.string().min(1),
  periodYear: z.number().int().min(2020),
  periodMonth: z.number().int().min(1).max(12),
  rentAmount: z.number().min(0),
  serviceCharge: z.number().min(0).default(0),
  otherCharges: z.number().min(0).default(0),
  dueDate: z.string().min(1),
  notes: z.string().optional(),
});

function generateInvoiceNumber(year: number, month: number, sequence: number) {
  return `INV-${year}${String(month).padStart(2, "0")}-${String(sequence).padStart(4, "0")}`;
}

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");
  const status = searchParams.get("status");
  const filterPropertyId = searchParams.get("propertyId");
  const effectivePropertyIds =
    filterPropertyId && propertyIds.includes(filterPropertyId)
      ? [filterPropertyId]
      : propertyIds;

  const invoices = await prisma.invoice.findMany({
    where: {
      tenant: { unit: { propertyId: { in: effectivePropertyIds } } },
      ...(tenantId ? { tenantId } : {}),
      ...(status ? { status: status as never } : {}),
    },
    include: {
      tenant: {
        select: {
          id: true, name: true, email: true, phone: true,
          unit: { select: { unitNumber: true, property: { select: { name: true } } } },
        },
      },
      _count: { select: { incomeEntries: true } },
    },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
  });

  return Response.json(invoices);
}

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;
  const locked = await requireActiveSubscription(session!.user.organizationId);
  if (locked) return locked;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { dueDate, ...rest } = parsed.data;

  // Verify the tenant belongs to an accessible property
  const tenant = await prisma.tenant.findUnique({
    where: { id: rest.tenantId },
    include: { unit: { select: { propertyId: true } } },
  });
  if (!tenant || !propertyIds.includes(tenant.unit.propertyId)) {
    return Response.json({ error: "Tenant not found or access denied" }, { status: 404 });
  }

  // Check for duplicate
  const existing = await prisma.invoice.findUnique({
    where: { tenantId_periodYear_periodMonth: { tenantId: rest.tenantId, periodYear: rest.periodYear, periodMonth: rest.periodMonth } },
  });
  if (existing) {
    return Response.json({ error: `Invoice already exists for ${format(new Date(rest.periodYear, rest.periodMonth - 1), "MMM yyyy")}` }, { status: 409 });
  }

  // Generate invoice number using count
  const count = await prisma.invoice.count();
  const invoiceNumber = generateInvoiceNumber(rest.periodYear, rest.periodMonth, count + 1);

  const totalAmount = rest.rentAmount + rest.serviceCharge + rest.otherCharges;

  const invoice = await prisma.invoice.create({
    data: {
      ...rest,
      invoiceNumber,
      totalAmount,
      dueDate: new Date(dueDate),
    },
    include: {
      tenant: {
        select: {
          id: true, name: true, email: true, phone: true,
          unit: { select: { unitNumber: true, property: { select: { name: true, address: true, city: true } } } },
        },
      },
    },
  });

  return Response.json(invoice, { status: 201 });
}
