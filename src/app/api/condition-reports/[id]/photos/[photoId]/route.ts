import { requireOpsStaffWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { deleteFromStorage } from "@/lib/supabase-storage";
import { loadInspection } from "@/lib/inspections";
import { canEditObservations } from "@/lib/inspection-rules";

export async function DELETE(_req: Request, props: { params: Promise<{ id: string; photoId: string }> }) {
  const params = await props.params;
  const { error } = await requireOpsStaffWrite();
  if (error) return error;
  const loaded = await loadInspection(params.id);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });
  if (!canEditObservations(loaded.report.status)) {
    return Response.json({ error: "This inspection has been handed in — its photos are locked." }, { status: 409 });
  }
  const photo = loaded.report.photos.find((p) => p.id === params.photoId);
  if (!photo) return Response.json({ error: "Not found" }, { status: 404 });

  try { await deleteFromStorage(photo.storagePath); } catch { /* best-effort */ }
  await prisma.conditionReportPhoto.delete({ where: { id: photo.id } });
  return Response.json({ ok: true });
}
