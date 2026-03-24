import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { InsuranceType, PremiumFrequency } from "@prisma/client";

const updateSchema = z.object({
  propertyId: z.string().optional(),
  type: z.nativeEnum(InsuranceType).optional(),
  typeOther: z.string().optional().nullable(),
  insurer: z.string().optional(),
  policyNumber: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  premiumAmount: z.number().positive().optional().nullable(),
  premiumFrequency: z.nativeEnum(PremiumFrequency).optional().nullable(),
  coverageAmount: z.number().positive().optional().nullable(),
  brokerName: z.string().optional().nullable(),
  brokerContact: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const policy = await prisma.insurancePolicy.findUnique({
      where: { id: params.id },
      include: {
        property: { select: { name: true } },
        documents: { orderBy: { uploadedAt: "desc" } },
      },
    });

    if (!policy) return Response.json({ error: "Not found" }, { status: 404 });
    if (!propertyIds.includes(policy.propertyId)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    return Response.json(policy);
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { session, error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const policy = await prisma.insurancePolicy.findUnique({
    where: { id: params.id },
    select: { propertyId: true, insurer: true, type: true, policyNumber: true },
  });

  if (!policy) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(policy.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  try {
    const updated = await prisma.insurancePolicy.update({
      where: { id: params.id },
      data: {
        ...(data.propertyId !== undefined && { propertyId: data.propertyId }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.typeOther !== undefined && { typeOther: data.typeOther }),
        ...(data.insurer !== undefined && { insurer: data.insurer }),
        ...(data.policyNumber !== undefined && { policyNumber: data.policyNumber }),
        ...(data.startDate !== undefined && { startDate: new Date(data.startDate) }),
        ...(data.endDate !== undefined && { endDate: new Date(data.endDate) }),
        ...(data.premiumAmount !== undefined && { premiumAmount: data.premiumAmount }),
        ...(data.premiumFrequency !== undefined && { premiumFrequency: data.premiumFrequency }),
        ...(data.coverageAmount !== undefined && { coverageAmount: data.coverageAmount }),
        ...(data.brokerName !== undefined && { brokerName: data.brokerName }),
        ...(data.brokerContact !== undefined && { brokerContact: data.brokerContact }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
      include: {
        property: { select: { name: true } },
        documents: { orderBy: { uploadedAt: "desc" } },
      },
    });

    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "UPDATE",
      resource: "InsurancePolicy",
      resourceId: params.id,
      before: policy,
      after: { insurer: updated.insurer, type: updated.type, policyNumber: updated.policyNumber },
    });

    return Response.json(updated);
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { session, error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const policy = await prisma.insurancePolicy.findUnique({
    where: { id: params.id },
    select: { propertyId: true, insurer: true, type: true, policyNumber: true },
  });

  if (!policy) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(policy.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await prisma.insurancePolicy.delete({ where: { id: params.id } });

    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "DELETE",
      resource: "InsurancePolicy",
      resourceId: params.id,
      before: policy,
    });

    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
