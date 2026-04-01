import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { AssetCategory } from "@prisma/client";

const assetSchema = z.object({
  propertyId: z.string().min(1, "Property is required"),
  unitId: z.string().optional().nullable(),
  name: z.string().min(1, "Asset name is required"),
  category: z.nativeEnum(AssetCategory),
  categoryOther: z.string().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  modelNumber: z.string().optional().nullable(),
  purchaseDate: z.string().optional().nullable(),
  purchaseCost: z.number().nonnegative().optional().nullable(),
  warrantyExpiry: z.string().optional().nullable(),
  serviceProvider: z.string().optional().nullable(),
  serviceContact: z.string().optional().nullable(),
  vendorId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const filterPropertyId = searchParams.get("propertyId");
  const filterCategory = searchParams.get("category");

  const effectivePropertyIds =
    filterPropertyId && propertyIds.includes(filterPropertyId)
      ? [filterPropertyId]
      : propertyIds;

  try {
    const assets = await prisma.asset.findMany({
      where: {
        propertyId: { in: effectivePropertyIds },
        ...(filterCategory ? { category: filterCategory as AssetCategory } : {}),
      },
      include: {
        property: { select: { name: true } },
        unit: { select: { unitNumber: true } },
        vendor: { select: { id: true, name: true, category: true, phone: true } },
        documents: { select: { id: true } },
        maintenanceSchedules: {
          where: { isActive: true },
          select: { id: true, taskName: true, frequency: true, nextDue: true, lastDone: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = assets.map((a) => ({
      ...a,
      documentsCount: a.documents.length,
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

  const parsed = assetSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  if (!propertyIds.includes(data.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const asset = await prisma.asset.create({
      data: {
        propertyId: data.propertyId,
        unitId: data.unitId ?? null,
        name: data.name,
        category: data.category,
        categoryOther: data.categoryOther ?? null,
        serialNumber: data.serialNumber ?? null,
        modelNumber: data.modelNumber ?? null,
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
        purchaseCost: data.purchaseCost ?? null,
        warrantyExpiry: data.warrantyExpiry ? new Date(data.warrantyExpiry) : null,
        serviceProvider: data.serviceProvider ?? null,
        serviceContact: data.serviceContact ?? null,
        vendorId: data.vendorId ?? null,
        notes: data.notes ?? null,
      },
      include: {
        property: { select: { name: true } },
        unit: { select: { unitNumber: true } },
        vendor: { select: { id: true, name: true, category: true, phone: true } },
        documents: true,
      },
    });

    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "CREATE",
      resource: "Asset",
      resourceId: asset.id,
      after: { name: asset.name, category: asset.category, propertyId: asset.propertyId },
    });

    return Response.json(asset, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
