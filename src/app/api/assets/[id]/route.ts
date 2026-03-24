import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { AssetCategory } from "@prisma/client";

const updateSchema = z.object({
  propertyId: z.string().optional(),
  unitId: z.string().optional().nullable(),
  name: z.string().optional(),
  category: z.nativeEnum(AssetCategory).optional(),
  categoryOther: z.string().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  modelNumber: z.string().optional().nullable(),
  purchaseDate: z.string().optional().nullable(),
  purchaseCost: z.number().nonnegative().optional().nullable(),
  warrantyExpiry: z.string().optional().nullable(),
  serviceProvider: z.string().optional().nullable(),
  serviceContact: z.string().optional().nullable(),
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
    const asset = await prisma.asset.findUnique({
      where: { id: params.id },
      include: {
        property: { select: { name: true } },
        unit: { select: { unitNumber: true } },
        documents: { orderBy: { uploadedAt: "desc" } },
      },
    });

    if (!asset) return Response.json({ error: "Not found" }, { status: 404 });
    if (!propertyIds.includes(asset.propertyId)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    return Response.json(asset);
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

  const asset = await prisma.asset.findUnique({
    where: { id: params.id },
    select: { propertyId: true, name: true, category: true },
  });

  if (!asset) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(asset.propertyId)) {
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
    const updated = await prisma.asset.update({
      where: { id: params.id },
      data: {
        ...(data.propertyId !== undefined && { propertyId: data.propertyId }),
        ...(data.unitId !== undefined && { unitId: data.unitId }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.categoryOther !== undefined && { categoryOther: data.categoryOther }),
        ...(data.serialNumber !== undefined && { serialNumber: data.serialNumber }),
        ...(data.modelNumber !== undefined && { modelNumber: data.modelNumber }),
        ...(data.purchaseDate !== undefined && {
          purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
        }),
        ...(data.purchaseCost !== undefined && { purchaseCost: data.purchaseCost }),
        ...(data.warrantyExpiry !== undefined && {
          warrantyExpiry: data.warrantyExpiry ? new Date(data.warrantyExpiry) : null,
        }),
        ...(data.serviceProvider !== undefined && { serviceProvider: data.serviceProvider }),
        ...(data.serviceContact !== undefined && { serviceContact: data.serviceContact }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
      include: {
        property: { select: { name: true } },
        unit: { select: { unitNumber: true } },
        documents: { orderBy: { uploadedAt: "desc" } },
      },
    });

    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "UPDATE",
      resource: "Asset",
      resourceId: params.id,
      before: asset,
      after: { name: updated.name, category: updated.category },
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

  const asset = await prisma.asset.findUnique({
    where: { id: params.id },
    select: { propertyId: true, name: true, category: true },
  });

  if (!asset) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(asset.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await prisma.asset.delete({ where: { id: params.id } });

    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "DELETE",
      resource: "Asset",
      resourceId: params.id,
      before: asset,
    });

    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
