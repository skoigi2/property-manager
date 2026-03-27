import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const agreementSchema = z.object({
  managementFeeRate:              z.coerce.number().min(0).max(100).default(8.5),
  vacancyFeeRate:                 z.coerce.number().min(0).max(100).default(5),
  vacancyFeeThresholdMonths:      z.coerce.number().int().min(1).default(9),
  newLettingFeeRate:              z.coerce.number().min(0).max(100).default(50),
  leaseRenewalFeeFlat:            z.coerce.number().min(0).default(3000),
  shortTermLettingFeeRate:        z.coerce.number().min(0).max(100).default(10),
  repairAuthorityLimit:           z.coerce.number().min(0).default(100000),
  setupFeeTotal:                  z.coerce.number().min(0).optional().nullable(),
  setupFeeInstalments:            z.coerce.number().int().min(1).default(3),
  rentRemittanceDay:              z.coerce.number().int().min(1).max(28).default(5),
  mgmtFeeInvoiceDay:              z.coerce.number().int().min(1).max(28).default(7),
  landlordPaymentDays:            z.coerce.number().int().min(1).default(2),
  kpiStartDate:                   z.string().optional().nullable(),
  kpiOccupancyTarget:             z.coerce.number().min(0).max(100).default(90),
  kpiRentCollectionTarget:        z.coerce.number().min(0).max(100).default(90),
  kpiExpenseRatioTarget:          z.coerce.number().min(0).max(100).default(85),
  kpiTenantTurnoverTarget:        z.coerce.number().min(0).max(100).default(90),
  kpiDaysToLeaseTarget:           z.coerce.number().int().min(1).default(60),
  kpiRenewalRateTarget:           z.coerce.number().min(0).max(100).default(90),
  kpiMaintenanceCompletionTarget: z.coerce.number().min(0).max(100).default(95),
  kpiEmergencyResponseHrs:        z.coerce.number().int().min(1).default(24),
  kpiStandardResponseHrs:         z.coerce.number().int().min(1).default(96),
});

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds?.includes(params.id)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const agreement = await prisma.managementAgreement.findUnique({
    where: { propertyId: params.id },
  });

  // Return agreement or sensible defaults so the form always has data
  return Response.json(agreement ?? { propertyId: params.id });
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds?.includes(params.id)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = agreementSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { kpiStartDate, ...rest } = parsed.data;

  const data = {
    ...rest,
    kpiStartDate: kpiStartDate ? new Date(kpiStartDate) : null,
  };

  const agreement = await prisma.managementAgreement.upsert({
    where:  { propertyId: params.id },
    create: { propertyId: params.id, ...data },
    update: data,
  });

  return Response.json(agreement);
}
