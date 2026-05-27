import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { deleteFromStorage } from "@/lib/supabase-storage";

export async function DELETE(_req: Request, { params }: { params: { id: string; photoId: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const photo = await prisma.conditionReportPhoto.findUnique({
    where: { id: params.photoId },
    include: { report: { select: { id: true, propertyId: true, tenantDocumentId: true } } },
  });
  if (!photo || photo.reportId !== params.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (!propertyIds.includes(photo.report.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (photo.report.tenantDocumentId) {
    return Response.json({ error: "Report finalised — cannot delete photos" }, { status: 409 });
  }

  try { await deleteFromStorage(photo.storagePath); } catch { /* best-effort */ }
  await prisma.conditionReportPhoto.delete({ where: { id: photo.id } });
  return Response.json({ ok: true });
}
