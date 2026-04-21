import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function generateOwnerInvoiceNumber(year: number, month: number, seq: number) {
  const mm = String(month).padStart(2, "0");
  const nn = String(seq).padStart(4, "0");
  return `OWN-${year}${mm}-${nn}`;
}

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;

  const accessibleIds = await getAccessiblePropertyIds();
  if (!accessibleIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { propertyId, periodYear, periodMonth } = body as {
    propertyId: string;
    periodYear: number;
    periodMonth: number;
  };

  if (!propertyId || !periodYear || !periodMonth) {
    return Response.json({ error: "propertyId, periodYear and periodMonth are required" }, { status: 400 });
  }
  if (!accessibleIds.includes(propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Idempotency — return 409 if already exists
  const existing = await prisma.ownerInvoice.findFirst({
    where: { propertyId, type: "RENEWAL_FEE", periodYear, periodMonth },
    select: { id: true, invoiceNumber: true },
  });
  if (existing) {
    return Response.json(
      { error: "A renewal fee invoice already exists for this period", invoiceId: existing.id },
      { status: 409 }
    );
  }

  // Tenants whose proposed lease end falls in the selected month and who have been renewed
  const periodStart = new Date(periodYear, periodMonth - 1, 1);
  const periodEnd   = new Date(periodYear, periodMonth, 0, 23, 59, 59, 999);

  const [property, agreement, renewedTenants] = await Promise.all([
    prisma.property.findUnique({
      where: { id: propertyId },
      select: { ownerId: true },
    }),
    prisma.managementAgreement.findUnique({
      where: { propertyId },
      select: { leaseRenewalFeeFlat: true, mgmtFeeInvoiceDay: true },
    }),
    prisma.tenant.findMany({
      where: {
        unit: { propertyId },
        renewalStage: "RENEWED",
        proposedLeaseEnd: { gte: periodStart, lte: periodEnd },
      },
      select: {
        name: true,
        unit: { select: { unitNumber: true } },
      },
    }),
  ]);

  if (!property) return Response.json({ error: "Property not found" }, { status: 404 });

  if (renewedTenants.length === 0) {
    return Response.json(
      {
        error: `No renewed leases found with an end date in ${MONTH_NAMES[periodMonth - 1]} ${periodYear}. Ensure tenants have reached the RENEWED stage and have a proposed lease end date set.`,
      },
      { status: 400 }
    );
  }

  const flatFee = agreement?.leaseRenewalFeeFlat ?? 3000;
  const lineItems = renewedTenants.map((t) => ({
    description: `Renewal Fee — ${t.name} — Unit ${t.unit.unitNumber}`,
    amount:      flatFee,
    unitId:      null,
    tenantId:    null,
    incomeType:  "RENEWAL_FEE",
  }));

  const totalAmount = lineItems.reduce((s, i) => s + i.amount, 0);

  const dueDayOfMonth = agreement?.mgmtFeeInvoiceDay ?? 7;
  const dueDate = new Date(periodYear, periodMonth - 1, dueDayOfMonth);

  const existingCount = await prisma.ownerInvoice.count({ where: { periodYear, periodMonth } });
  const invoiceNumber = generateOwnerInvoiceNumber(periodYear, periodMonth, existingCount + 1);

  const invoice = await prisma.ownerInvoice.create({
    data: {
      invoiceNumber,
      propertyId,
      ownerId:     property.ownerId ?? null,
      type:        "RENEWAL_FEE",
      periodYear,
      periodMonth,
      lineItems:   lineItems as never,
      totalAmount,
      dueDate,
      status:      "DRAFT",
    },
    include: {
      property: { select: { name: true } },
      owner:    { select: { name: true, email: true } },
    },
  });

  await logAudit({
    userId:     session!.user.id,
    userEmail:  session!.user.email,
    action:     "CREATE",
    resource:   "OwnerInvoice",
    resourceId: invoice.id,
    organizationId: session!.user.organizationId,
    after: { invoiceNumber, type: "RENEWAL_FEE", totalAmount },
  });

  return Response.json(invoice, { status: 201 });
}
