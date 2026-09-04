import { requireAuth, getAccessiblePropertyIds, requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { AssetCategory } from "@prisma/client";
import { withSignedDocumentUrls, removeStoredDocumentFile } from "@/lib/entity-document-urls";

const updateSchema = z.object({
  propertyId: z.string().optional(),
  unitId: z.string().optional().nullable(),
  name: z.string().trim().min(1).optional(),
  category: z.nativeEnum(AssetCategory).optional(),
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
  /** Set to retire the asset (kept with its history); null to reinstate. */
  disposedAt: z.string().optional().nullable(),
  disposalNotes: z.string().max(2000).optional().nullable(),
});

function firstMessage(err: z.ZodError): string {
  const f = err.flatten();
  return f.formErrors[0] ?? Object.values(f.fieldErrors).flat()[0] ?? "Invalid input";
}

const INCLUDE = {
  property: { select: { name: true, currency: true } },
  unit: { select: { unitNumber: true } },
  vendor: { select: { id: true, name: true, category: true, phone: true } },
} as const;

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
      include: { ...INCLUDE, documents: { orderBy: { uploadedAt: "desc" } } },
    });

    if (!asset) return Response.json({ error: "Not found" }, { status: 404 });
    if (!propertyIds.includes(asset.propertyId)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    return Response.json({ ...asset, documents: await withSignedDocumentUrls(asset.documents) });
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

  const asset = await prisma.asset.findUnique({
    where: { id: params.id },
    select: { propertyId: true, unitId: true, name: true, category: true, serialNumber: true, disposedAt: true },
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
    return Response.json({ error: firstMessage(parsed.error) }, { status: 400 });
  }

  const data = parsed.data;

  // Moving an asset to another property needs access to that property too.
  if (data.propertyId !== undefined && !propertyIds.includes(data.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const nextPropertyId = data.propertyId ?? asset.propertyId;
  const nextUnitId = data.unitId !== undefined ? data.unitId : asset.unitId;
  if (nextUnitId) {
    const unit = await prisma.unit.findUnique({ where: { id: nextUnitId }, select: { propertyId: true } });
    if (!unit || unit.propertyId !== nextPropertyId) {
      return Response.json({ error: "That unit is not in the selected property" }, { status: 400 });
    }
  }
  const nextCategory = data.category ?? asset.category;
  let disposedAt: Date | null | undefined = undefined;
  if (data.disposedAt !== undefined) {
    disposedAt = data.disposedAt ? new Date(data.disposedAt) : null;
    if (disposedAt && isNaN(disposedAt.getTime())) return Response.json({ error: "Invalid disposal date" }, { status: 400 });
    if (disposedAt && disposedAt.getTime() > Date.now() + 86_400_000) return Response.json({ error: "Disposal date cannot be in the future" }, { status: 400 });
  }

  try {
    const updated = await prisma.asset.update({
      where: { id: params.id },
      data: {
        ...(data.propertyId !== undefined && { propertyId: data.propertyId }),
        ...(data.unitId !== undefined && { unitId: data.unitId }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.category !== undefined && { category: data.category }),
        ...((data.categoryOther !== undefined || data.category !== undefined) && {
          categoryOther: nextCategory === "OTHER" ? (data.categoryOther?.trim() || null) : null,
        }),
        ...(data.serialNumber !== undefined && { serialNumber: data.serialNumber?.trim() || null }),
        ...(data.modelNumber !== undefined && { modelNumber: data.modelNumber?.trim() || null }),
        ...(data.purchaseDate !== undefined && {
          purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
        }),
        ...(data.purchaseCost !== undefined && { purchaseCost: data.purchaseCost }),
        ...(data.replacementValue !== undefined && { replacementValue: data.replacementValue }),
        ...(data.warrantyExpiry !== undefined && {
          warrantyExpiry: data.warrantyExpiry ? new Date(data.warrantyExpiry) : null,
        }),
        ...(data.serviceProvider !== undefined && { serviceProvider: data.serviceProvider?.trim() || null }),
        ...(data.serviceContact !== undefined && { serviceContact: data.serviceContact?.trim() || null }),
        ...(data.vendorId !== undefined && { vendorId: data.vendorId }),
        ...(data.notes !== undefined && { notes: data.notes?.trim() || null }),
        ...(disposedAt !== undefined && { disposedAt }),
        // Reinstating clears the note; disposing without a note leaves it null.
        ...(disposedAt !== undefined && { disposalNotes: disposedAt ? (data.disposalNotes?.trim() || null) : null }),
        ...(disposedAt === undefined && data.disposalNotes !== undefined && { disposalNotes: data.disposalNotes?.trim() || null }),
      },
      include: {
        ...INCLUDE,
        documents: { select: { id: true, category: true } },
        maintenanceSchedules: { where: { isActive: true }, select: { id: true, taskName: true, frequency: true, nextDue: true, lastDone: true } },
      },
    });

    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "UPDATE",
      resource: "Asset",
      resourceId: params.id,
      organizationId: session!.user.organizationId,
      before: asset,
      after: { name: updated.name, category: updated.category, propertyId: updated.propertyId, serialNumber: updated.serialNumber, disposedAt: updated.disposedAt },
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

  const asset = await prisma.asset.findUnique({
    where: { id: params.id },
    select: { propertyId: true, name: true, category: true, documents: { select: { fileUrl: true } } },
  });

  if (!asset) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(asset.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await prisma.asset.delete({ where: { id: params.id } });

    // The document rows cascade; the files behind them don't — clean up best-effort.
    for (const d of asset.documents) await removeStoredDocumentFile(d.fileUrl);

    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "DELETE",
      resource: "Asset",
      resourceId: params.id,
      organizationId: session!.user.organizationId,
      before: { name: asset.name, category: asset.category, documents: asset.documents.length },
    });

    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
