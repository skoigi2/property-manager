import { requireManager, getAccessiblePropertyIds, requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { agreementApiSchema as agreementSchema } from "@/lib/agreement-form";

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
  const { error } = await requireManagerWrite();
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

  // A payment account must belong to the property's organisation.
  if (parsed.data.paymentAccountId) {
    const [account, property] = await Promise.all([
      prisma.paymentAccount.findUnique({
        where: { id: parsed.data.paymentAccountId },
        select: { organizationId: true },
      }),
      prisma.property.findUnique({ where: { id: params.id }, select: { organizationId: true } }),
    ]);
    if (!account || account.organizationId !== property?.organizationId) {
      return Response.json({ error: "Payment account not found" }, { status: 400 });
    }
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
