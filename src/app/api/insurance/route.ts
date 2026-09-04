import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { requireActiveSubscription } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { InsuranceType, PremiumFrequency } from "@prisma/client";
import { contentsCoverCheck } from "@/lib/contents-cover";

const insurancePolicySchema = z.object({
  propertyId: z.string().min(1, "Property is required"),
  type: z.nativeEnum(InsuranceType),
  typeOther: z.string().optional().nullable(),
  insurer: z.string().trim().min(1, "Insurer is required"),
  policyNumber: z.string().trim().min(1, "Policy number is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  premiumAmount: z.number().positive().optional().nullable(),
  premiumFrequency: z.nativeEnum(PremiumFrequency).optional().nullable(),
  coverageAmount: z.number().positive().optional().nullable(),
  brokerName: z.string().optional().nullable(),
  brokerContact: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
}).superRefine((v, ctx) => {
  if (new Date(v.endDate) <= new Date(v.startDate)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "End date must be after the start date" });
  }
  if (v.premiumAmount && !v.premiumFrequency) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["premiumFrequency"], message: "Pick how often the premium is paid" });
  }
});

/** First human-readable message out of a flattened zod error. */
function firstZodMessage(err: z.ZodError): string {
  const f = err.flatten();
  return f.formErrors[0] ?? Object.values(f.fieldErrors).flat()[0] ?? "Invalid input";
}

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
    const [policies, assetTotals] = await Promise.all([
      prisma.insurancePolicy.findMany({
        where: { propertyId: { in: effectivePropertyIds } },
        include: {
          property: { select: { name: true, currency: true } },
          documents: { select: { id: true, category: true } },
        },
        orderBy: { endDate: "asc" },
      }),
      // What the asset register says the contents would cost to replace, per
      // property — in-service assets that carry a replacement value only.
      prisma.asset.groupBy({
        by: ["propertyId"],
        where: { propertyId: { in: effectivePropertyIds }, disposedAt: null, replacementValue: { not: null } },
        _sum: { replacementValue: true },
        _count: { _all: true },
      }),
    ]);
    const replacementByProperty = new Map(
      assetTotals.map((t) => [t.propertyId, { total: Number(t._sum.replacementValue ?? 0), count: t._count._all }]),
    );

    const result = policies.map(({ documents, ...p }) => {
      const reg = replacementByProperty.get(p.propertyId) ?? { total: 0, count: 0 };
      return {
        ...p,
        documentsCount: documents.length,
        // Which kinds of paperwork are on file — the card shows these as chips
        // so "no valuation report" is visible without opening the panel.
        documentCategories: Array.from(new Set(documents.map((d) => d.category))),
        // Only meaningful for CONTENTS cover; null elsewhere.
        contentsCheck: p.type === "CONTENTS"
          ? contentsCoverCheck(p.coverageAmount === null ? null : Number(p.coverageAmount), reg.total, reg.count)
          : null,
      };
    });

    return Response.json(result);
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;
  const locked = await requireActiveSubscription(session!.user.organizationId);
  if (locked) return locked;

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
    return Response.json({ error: firstZodMessage(parsed.error) }, { status: 400 });
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
        typeOther: data.type === "OTHER" ? (data.typeOther?.trim() || null) : null,
        insurer: data.insurer,
        policyNumber: data.policyNumber,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        premiumAmount: data.premiumAmount ?? null,
        premiumFrequency: data.premiumFrequency ?? null,
        coverageAmount: data.coverageAmount ?? null,
        brokerName: data.brokerName?.trim() || null,
        brokerContact: data.brokerContact?.trim() || null,
        notes: data.notes?.trim() || null,
      },
      include: {
        property: { select: { name: true, currency: true } },
      },
    });

    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "CREATE",
      resource: "InsurancePolicy",
      resourceId: policy.id,
      organizationId: session!.user.organizationId,
      after: { insurer: policy.insurer, type: policy.type, policyNumber: policy.policyNumber, endDate: policy.endDate },
    });

    return Response.json({ ...policy, documentsCount: 0, documentCategories: [] }, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
