import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { requireActiveSubscription } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  tenantId: z.string(),
  propertyId: z.string(),
  amountOwed: z.number().positive(),
  notes: z.string().optional(),
});

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const filterPropertyId = searchParams.get("propertyId");
  const effectivePropertyIds =
    filterPropertyId && propertyIds.includes(filterPropertyId)
      ? [filterPropertyId]
      : propertyIds;

  const [cases, agreements] = await Promise.all([
    prisma.arrearsCase.findMany({
      where: { propertyId: { in: effectivePropertyIds } },
      include: {
        tenant: { select: { id: true, name: true, phone: true, email: true, unit: { select: { unitNumber: true } } } },
        property: { select: { name: true, currency: true } },
        escalations: { orderBy: { createdAt: "desc" } },
      },
      orderBy: [{ stage: "asc" }, { updatedAt: "desc" }],
    }),
    prisma.managementAgreement.findMany({
      where: { propertyId: { in: effectivePropertyIds } },
      select: { propertyId: true, latePaymentInterestRate: true },
    }),
  ]);

  const rateByProperty = Object.fromEntries(
    agreements.map((a) => [a.propertyId, a.latePaymentInterestRate])
  );

  const casesWithRate = cases.map((c) => ({
    ...c,
    latePaymentInterestRate: rateByProperty[c.propertyId] ?? 12,
  }));

  return Response.json(casesWithRate);
}

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;
  const locked = await requireActiveSubscription(session!.user.organizationId);
  if (locked) return locked;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  // Prevent duplicate open cases for same tenant
  const existing = await prisma.arrearsCase.findFirst({
    where: { tenantId: parsed.data.tenantId, stage: { not: "RESOLVED" } },
  });
  if (existing) return Response.json({ error: "An open arrears case already exists for this tenant." }, { status: 409 });

  const arrearsCase = await prisma.arrearsCase.create({
    data: {
      ...parsed.data,
      escalations: {
        create: { stage: "INFORMAL_REMINDER", notes: parsed.data.notes ?? null },
      },
    },
    include: {
      tenant: { select: { id: true, name: true, phone: true, email: true, unit: { select: { unitNumber: true } } } },
      property: { select: { name: true, currency: true } },
      escalations: { orderBy: { createdAt: "desc" } },
    },
  });

  return Response.json(arrearsCase, { status: 201 });
}
