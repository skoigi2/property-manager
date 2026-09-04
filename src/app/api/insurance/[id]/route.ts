import { requireAuth, getAccessiblePropertyIds, requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { InsuranceType, PremiumFrequency } from "@prisma/client";
import { withSignedDocumentUrls, removeStoredDocumentFile } from "@/lib/entity-document-urls";

const updateSchema = z.object({
  propertyId: z.string().optional(),
  type: z.nativeEnum(InsuranceType).optional(),
  typeOther: z.string().optional().nullable(),
  insurer: z.string().trim().min(1).optional(),
  policyNumber: z.string().trim().min(1).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  premiumAmount: z.number().positive().optional().nullable(),
  premiumFrequency: z.nativeEnum(PremiumFrequency).optional().nullable(),
  coverageAmount: z.number().positive().optional().nullable(),
  brokerName: z.string().optional().nullable(),
  brokerContact: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

function firstMessage(err: z.ZodError): string {
  const f = err.flatten();
  return f.formErrors[0] ?? Object.values(f.fieldErrors).flat()[0] ?? "Invalid input";
}

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
        property: { select: { name: true, currency: true } },
        documents: { orderBy: { uploadedAt: "desc" } },
      },
    });

    if (!policy) return Response.json({ error: "Not found" }, { status: 404 });
    if (!propertyIds.includes(policy.propertyId)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    return Response.json({ ...policy, documents: await withSignedDocumentUrls(policy.documents) });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const policy = await prisma.insurancePolicy.findUnique({
    where: { id: params.id },
    select: { propertyId: true, insurer: true, type: true, policyNumber: true, startDate: true, endDate: true },
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
    return Response.json({ error: firstMessage(parsed.error) }, { status: 400 });
  }

  const data = parsed.data;

  // Moving a policy to another property needs access to that property too.
  if (data.propertyId !== undefined && !propertyIds.includes(data.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const nextStart = data.startDate !== undefined ? new Date(data.startDate) : policy.startDate;
  const nextEnd = data.endDate !== undefined ? new Date(data.endDate) : policy.endDate;
  if (isNaN(nextStart.getTime()) || isNaN(nextEnd.getTime())) {
    return Response.json({ error: "Invalid date" }, { status: 400 });
  }
  if (nextEnd <= nextStart) {
    return Response.json({ error: "End date must be after the start date" }, { status: 400 });
  }
  const nextType = data.type ?? policy.type;

  try {
    const updated = await prisma.insurancePolicy.update({
      where: { id: params.id },
      data: {
        ...(data.propertyId !== undefined && { propertyId: data.propertyId }),
        ...(data.type !== undefined && { type: data.type }),
        ...((data.typeOther !== undefined || data.type !== undefined) && {
          typeOther: nextType === "OTHER" ? (data.typeOther?.trim() || null) : null,
        }),
        ...(data.insurer !== undefined && { insurer: data.insurer }),
        ...(data.policyNumber !== undefined && { policyNumber: data.policyNumber }),
        ...(data.startDate !== undefined && { startDate: nextStart }),
        ...(data.endDate !== undefined && { endDate: nextEnd }),
        ...(data.premiumAmount !== undefined && { premiumAmount: data.premiumAmount }),
        ...(data.premiumFrequency !== undefined && { premiumFrequency: data.premiumFrequency }),
        ...(data.coverageAmount !== undefined && { coverageAmount: data.coverageAmount }),
        ...(data.brokerName !== undefined && { brokerName: data.brokerName?.trim() || null }),
        ...(data.brokerContact !== undefined && { brokerContact: data.brokerContact?.trim() || null }),
        ...(data.notes !== undefined && { notes: data.notes?.trim() || null }),
      },
      include: {
        property: { select: { name: true, currency: true } },
        documents: { select: { id: true, category: true } },
      },
    });

    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "UPDATE",
      resource: "InsurancePolicy",
      resourceId: params.id,
      organizationId: session!.user.organizationId,
      before: policy,
      after: { insurer: updated.insurer, type: updated.type, policyNumber: updated.policyNumber, startDate: updated.startDate, endDate: updated.endDate },
    });

    const { documents, ...rest } = updated;
    return Response.json({
      ...rest,
      documentsCount: documents.length,
      documentCategories: Array.from(new Set(documents.map((d) => d.category))),
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const policy = await prisma.insurancePolicy.findUnique({
    where: { id: params.id },
    select: { propertyId: true, insurer: true, type: true, policyNumber: true, documents: { select: { fileUrl: true } } },
  });

  if (!policy) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(policy.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await prisma.insurancePolicy.delete({ where: { id: params.id } });

    // The document rows cascade; the files behind them don't — clean up best-effort.
    for (const d of policy.documents) await removeStoredDocumentFile(d.fileUrl);

    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "DELETE",
      resource: "InsurancePolicy",
      resourceId: params.id,
      organizationId: session!.user.organizationId,
      before: { insurer: policy.insurer, type: policy.type, policyNumber: policy.policyNumber, documents: policy.documents.length },
    });

    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
