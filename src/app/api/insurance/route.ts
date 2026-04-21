import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { InsuranceType, PremiumFrequency } from "@prisma/client";

const insurancePolicySchema = z.object({
  propertyId: z.string().min(1, "Property is required"),
  type: z.nativeEnum(InsuranceType),
  typeOther: z.string().optional().nullable(),
  insurer: z.string().min(1, "Insurer is required"),
  policyNumber: z.string().min(1, "Policy number is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  premiumAmount: z.number().positive().optional().nullable(),
  premiumFrequency: z.nativeEnum(PremiumFrequency).optional().nullable(),
  coverageAmount: z.number().positive().optional().nullable(),
  brokerName: z.string().optional().nullable(),
  brokerContact: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
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

  try {
    const policies = await prisma.insurancePolicy.findMany({
      where: { propertyId: { in: effectivePropertyIds } },
      include: {
        property: { select: { name: true } },
        documents: { select: { id: true } },
      },
      orderBy: { endDate: "asc" },
    });

    const result = policies.map((p) => ({
      ...p,
      documentsCount: p.documents.length,
    }));

    return Response.json(result);
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = insurancePolicySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  if (!propertyIds.includes(data.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const policy = await prisma.insurancePolicy.create({
      data: {
        propertyId: data.propertyId,
        type: data.type,
        typeOther: data.typeOther ?? null,
        insurer: data.insurer,
        policyNumber: data.policyNumber,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        premiumAmount: data.premiumAmount ?? null,
        premiumFrequency: data.premiumFrequency ?? null,
        coverageAmount: data.coverageAmount ?? null,
        brokerName: data.brokerName ?? null,
        brokerContact: data.brokerContact ?? null,
        notes: data.notes ?? null,
      },
      include: {
        property: { select: { name: true } },
        documents: true,
      },
    });

    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "CREATE",
      resource: "InsurancePolicy",
      resourceId: policy.id,
      organizationId: session!.user.organizationId,
      after: { insurer: policy.insurer, type: policy.type, policyNumber: policy.policyNumber },
    });

    return Response.json(policy, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
