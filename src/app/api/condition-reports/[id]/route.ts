import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { conditionReportPatchSchema } from "@/lib/validations";
import { getSignedUrl, deleteFromStorage } from "@/lib/supabase-storage";

async function loadReport(id: string) {
  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };

  const report = await prisma.conditionReport.findUnique({
    where: { id },
    include: {
      unit: { select: { id: true, unitNumber: true, type: true } },
      property: {
        select: {
          id: true, name: true, address: true, currency: true, logoUrl: true, organizationId: true,
          organization: { select: { name: true, logoUrl: true, address: true } },
        },
      },
      tenant: { select: { id: true, name: true, email: true, phone: true, leaseStart: true, leaseEnd: true } },
      photos: { orderBy: { uploadedAt: "asc" } },
    },
  });
  if (!report) return { error: Response.json({ error: "Not found" }, { status: 404 }) };
  if (!propertyIds.includes(report.propertyId)) {
    return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { report };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const { report, error: notOk } = await loadReport(params.id);
  if (notOk) return notOk;

  // Hand back signed URLs for each photo so the client can show thumbnails.
  const photosWithUrls = await Promise.all(
    report!.photos.map(async (p) => {
      let url: string | null = null;
      try { url = await getSignedUrl(p.storagePath); } catch { /* keep null */ }
      return { ...p, url };
    })
  );

  return Response.json({ ...report, photos: photosWithUrls });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const { report, error: notOk } = await loadReport(params.id);
  if (notOk) return notOk;

  if (report!.tenantDocumentId) {
    return Response.json({ error: "Report finalised — read-only" }, { status: 409 });
  }

  const body = await req.json();
  const parsed = conditionReportPatchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const updated = await prisma.conditionReport.update({
    where: { id: report!.id },
    data: {
      ...(data.reportDate !== undefined ? { reportDate: new Date(data.reportDate) } : {}),
      ...(data.tenantId !== undefined ? { tenantId: data.tenantId } : {}),
      ...(data.items !== undefined ? { items: data.items as unknown as Prisma.InputJsonValue } : {}),
      ...(data.overallComments !== undefined ? { overallComments: data.overallComments } : {}),
      ...(data.signedByTenant !== undefined ? { signedByTenant: data.signedByTenant } : {}),
      ...(data.signedByManager !== undefined ? { signedByManager: data.signedByManager } : {}),
    },
  });

  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const { report, error: notOk } = await loadReport(params.id);
  if (notOk) return notOk;

  if (report!.tenantDocumentId) {
    return Response.json({ error: "Cannot delete a finalised report" }, { status: 409 });
  }

  // Best-effort: clean up storage for any photos.
  for (const p of report!.photos) {
    try { await deleteFromStorage(p.storagePath); } catch { /* swallow */ }
  }

  await prisma.conditionReport.delete({ where: { id: report!.id } });
  return Response.json({ ok: true });
}
