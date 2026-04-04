import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { formatCurrency } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { format } from "date-fns";

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
    where: { propertyId, type: "VACANCY_FEE", periodYear, periodMonth },
    select: { id: true, invoiceNumber: true },
  });
  if (existing) {
    return Response.json(
      { error: "A vacancy fee invoice already exists for this period", invoiceId: existing.id },
      { status: 409 }
    );
  }

  const [property, agreement] = await Promise.all([
    prisma.property.findUnique({
      where: { id: propertyId },
      select: { ownerId: true, currency: true },
    }),
    prisma.managementAgreement.findUnique({
      where: { propertyId },
      select: { vacancyFeeRate: true, vacancyFeeThresholdMonths: true, mgmtFeeInvoiceDay: true },
    }),
  ]);

  if (!property) return Response.json({ error: "Property not found" }, { status: 404 });

  const thresholdMonths = agreement?.vacancyFeeThresholdMonths ?? 9;
  const rate            = agreement?.vacancyFeeRate ?? 5;

  // Cutoff: unit must have been vacant since before this date to qualify
  const periodStart = new Date(periodYear, periodMonth - 1, 1);
  const vacantCutoff = new Date(periodStart);
  vacantCutoff.setMonth(vacantCutoff.getMonth() - thresholdMonths);

  const vacantUnits = await prisma.unit.findMany({
    where: {
      propertyId,
      status:      "VACANT",
      vacantSince: { lte: vacantCutoff },
      monthlyRent: { gt: 0 },
    },
    select: {
      unitNumber:  true,
      monthlyRent: true,
      vacantSince: true,
    },
  });

  if (vacantUnits.length === 0) {
    return Response.json(
      {
        error: `No units have been vacant for more than ${thresholdMonths} months as of ${MONTH_NAMES[periodMonth - 1]} ${periodYear}`,
      },
      { status: 400 }
    );
  }

  const lineItems = vacantUnits.map((u) => {
    const rent   = u.monthlyRent ?? 0;
    const amount = (rate / 100) * rent;
    const since  = u.vacantSince ? format(new Date(u.vacantSince), "d MMM yyyy") : "unknown";
    return {
      description: `Vacancy Fee — Unit ${u.unitNumber} (${rate}% \u00d7 ${formatCurrency(rent, property!.currency ?? "USD")}) — vacant since ${since}`,
      amount,
      unitId:      null,
      tenantId:    null,
      incomeType:  "VACANCY_FEE",
    };
  });

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
      type:        "VACANCY_FEE",
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
    after: { invoiceNumber, type: "VACANCY_FEE", totalAmount },
  });

  return Response.json(invoice, { status: 201 });
}
