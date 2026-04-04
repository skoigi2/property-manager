import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const bundleSchema = z.object({
  propertyId:  z.string().min(1),
  year:        z.number().int().min(2020),
  month:       z.number().int().min(1).max(12),
  dueDate:     z.string().min(1),
});

function generateOwnerInvoiceNumber(year: number, month: number, seq: number) {
  const mm = String(month).padStart(2, "0");
  const nn = String(seq).padStart(4, "0");
  return `OWN-${year}${mm}-${nn}`;
}

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = bundleSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { propertyId, year, month, dueDate } = parsed.data;

  if (!propertyIds.includes(propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Validate property is AIRBNB type
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, type: true, ownerId: true, units: { select: { id: true, unitNumber: true } } },
  });
  if (!property) return Response.json({ error: "Property not found" }, { status: 404 });
  if (property.type !== "AIRBNB") {
    return Response.json({ error: "Bundling is only supported for Airbnb properties" }, { status: 400 });
  }

  // Get letting fee rate from agreement
  const agreement = await prisma.managementAgreement.findUnique({
    where: { propertyId },
    select: { shortTermLettingFeeRate: true },
  });
  const feeRate = (agreement?.shortTermLettingFeeRate ?? 10) / 100;

  // Fetch all Airbnb income entries for this property/period
  const unitIds = property.units.map((u) => u.id);
  const unitMap = Object.fromEntries(property.units.map((u) => [u.id, u.unitNumber]));

  const airbnbEntries = await prisma.incomeEntry.findMany({
    where: {
      unitId: { in: unitIds },
      type:   "AIRBNB",
      date: {
        gte: new Date(year, month - 1, 1),
        lt:  new Date(year, month, 1),
      },
    },
    orderBy: { date: "asc" },
  });

  if (airbnbEntries.length === 0) {
    return Response.json({ bundled: 0, message: "No Airbnb income found for this period" });
  }

  // Check for existing bundle invoice for this period
  const existing = await prisma.ownerInvoice.findFirst({
    where: { propertyId, periodYear: year, periodMonth: month, type: "PERIODIC_LETTING_FEE" },
  });
  if (existing) {
    return Response.json({ error: "A bundle invoice already exists for this period" }, { status: 409 });
  }

  // Build line items
  const lineItems = airbnbEntries.map((entry) => {
    const unitNumber = unitMap[entry.unitId] ?? "Unknown Unit";
    const checkIn  = entry.checkIn  ? new Date(entry.checkIn).toLocaleDateString("en-US")  : null;
    const checkOut = entry.checkOut ? new Date(entry.checkOut).toLocaleDateString("en-US") : null;
    const dateLabel = checkIn && checkOut ? `${checkIn} – ${checkOut}` : new Date(entry.date).toLocaleDateString("en-US");
    return {
      description: `Airbnb letting fee — Unit ${unitNumber} (${dateLabel})`,
      amount:      Math.round(entry.grossAmount * feeRate),
      unitId:      entry.unitId,
      tenantId:    null,
      incomeType:  "LETTING_FEE" as const,
    };
  });

  const totalAmount = lineItems.reduce((s, i) => s + i.amount, 0);

  const existingCount = await prisma.ownerInvoice.count({
    where: { periodYear: year, periodMonth: month },
  });
  const invoiceNumber = generateOwnerInvoiceNumber(year, month, existingCount + 1);

  const invoice = await prisma.ownerInvoice.create({
    data: {
      invoiceNumber,
      propertyId,
      ownerId:    property.ownerId ?? null,
      type:       "PERIODIC_LETTING_FEE",
      periodYear:  year,
      periodMonth: month,
      lineItems:   lineItems as never,
      totalAmount,
      dueDate:     new Date(dueDate),
      status:      "DRAFT",
    },
  });

  await logAudit({
    userId:    session!.user.id,
    userEmail: session!.user.email,
    action:    "CREATE",
    resource:  "OwnerInvoice",
    resourceId: invoice.id,
    after: { invoiceNumber, type: "PERIODIC_LETTING_FEE", totalAmount, bundled: lineItems.length },
  });

  return Response.json({ bundled: lineItems.length, totalAmount, invoiceId: invoice.id }, { status: 201 });
}
