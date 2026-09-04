import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { requireActiveSubscription } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { AssetCategory } from "@prisma/client";

const assetSchema = z.object({
  propertyId: z.string().min(1, "Property is required"),
  unitId: z.string().optional().nullable(),
  name: z.string().trim().min(1, "Asset name is required"),
  category: z.nativeEnum(AssetCategory),
  categoryOther: z.string().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  modelNumber: z.string().optional().nullable(),
  purchaseDate: z.string().optional().nullable(),
  purchaseCost: z.number().nonnegative().optional().nullable(),
  replacementValue: z.number().nonnegative().optional().nullable(),
  warrantyExpiry: z.string().optional().nullable(),
  serviceProvider: z.string().optional().nullable(),
  serviceContact: z.string().optional().nullable(),
  vendorId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

function firstMessage(err: z.ZodError): string {
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
  const filterCategory = searchParams.get("category");
  const includeDisposed = searchParams.get("includeDisposed") === "true";

  const effectivePropertyIds =
    filterPropertyId && propertyIds.includes(filterPropertyId)
      ? [filterPropertyId]
      : propertyIds;

  try {
    const assets = await prisma.asset.findMany({
      where: {
        propertyId: { in: effectivePropertyIds },
        ...(filterCategory ? { category: filterCategory as AssetCategory } : {}),
        ...(includeDisposed ? {} : { disposedAt: null }),
      },
      include: {
        property: { select: { name: true, currency: true } },
        unit: { select: { unitNumber: true } },
        vendor: { select: { id: true, name: true, category: true, phone: true } },
        documents: { select: { id: true, category: true } },
        maintenanceSchedules: {
          where: { isActive: true },
          select: { id: true, taskName: true, frequency: true, nextDue: true, lastDone: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = assets.map(({ documents, ...a }) => ({
      ...a,
      documentsCount: documents.length,
      // Which kinds of paperwork are on file — the card shows these as chips.
      documentCategories: Array.from(new Set(documents.map((d) => d.category))),
    }));

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

  const parsed = assetSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstMessage(parsed.error) }, { status: 400 });
  }

  const data = parsed.data;

  if (!propertyIds.includes(data.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  // A unit must belong to the property the asset is filed under.
  if (data.unitId) {
    const unit = await prisma.unit.findUnique({ where: { id: data.unitId }, select: { propertyId: true } });
    if (!unit || unit.propertyId !== data.propertyId) {
      return Response.json({ error: "That unit is not in the selected property" }, { status: 400 });
    }
  }

  try {
    const asset = await prisma.asset.create({
      data: {
        propertyId: data.propertyId,
        unitId: data.unitId ?? null,
        name: data.name,
        category: data.category,
        categoryOther: data.category === "OTHER" ? (data.categoryOther?.trim() || null) : null,
        serialNumber: data.serialNumber?.trim() || null,
        modelNumber: data.modelNumber?.trim() || null,
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
        purchaseCost: data.purchaseCost ?? null,
        replacementValue: data.replacementValue ?? null,
        warrantyExpiry: data.warrantyExpiry ? new Date(data.warrantyExpiry) : null,
        serviceProvider: data.serviceProvider?.trim() || null,
        serviceContact: data.serviceContact?.trim() || null,
        vendorId: data.vendorId ?? null,
        notes: data.notes?.trim() || null,
      },
      include: {
        property: { select: { name: true, currency: true } },
        unit: { select: { unitNumber: true } },
        vendor: { select: { id: true, name: true, category: true, phone: true } },
        maintenanceSchedules: { where: { isActive: true }, select: { id: true, taskName: true, frequency: true, nextDue: true, lastDone: true } },
      },
    });

    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "CREATE",
      resource: "Asset",
      resourceId: asset.id,
      organizationId: session!.user.organizationId,
      after: { name: asset.name, category: asset.category, propertyId: asset.propertyId, serialNumber: asset.serialNumber },
    });

    return Response.json({ ...asset, documentsCount: 0, documentCategories: [] }, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
