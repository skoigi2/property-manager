import { requireOpsStaffWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { uploadToStorage, getSignedUrl } from "@/lib/supabase-storage";
import { loadInspection } from "@/lib/inspections";
import { canEditObservations } from "@/lib/inspection-rules";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

// One photo per request, while the inspection is still being filled in.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error } = await requireOpsStaffWrite();
  if (error) return error;
  const loaded = await loadInspection(params.id);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });
  const report = loaded.report;
  if (!canEditObservations(report.status)) {
    return Response.json({ error: "This inspection has been handed in — no more photos can be added." }, { status: 409 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "File too large (max 8 MB)" }, { status: 400 });
  if (!ALLOWED.includes(file.type)) return Response.json({ error: "Unsupported image type" }, { status: 400 });

  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "photo";
  const storagePath = `condition-reports/${report.id}/${Date.now()}-${safeFileName}`;
  try {
    await uploadToStorage(storagePath, Buffer.from(await file.arrayBuffer()), file.type);
  } catch {
    return Response.json({ error: "Photo storage is unavailable — try again shortly.", code: "STORAGE_UNAVAILABLE" }, { status: 503 });
  }

  const photo = await prisma.conditionReportPhoto.create({
    data: { reportId: report.id, storagePath, fileName: file.name, mimeType: file.type, fileSize: file.size },
  });
  if (report.status === "SCHEDULED") {
    await prisma.conditionReport.update({ where: { id: report.id }, data: { status: "IN_PROGRESS" } });
  }

  let url: string | null = null;
  try { url = await getSignedUrl(storagePath); } catch { /* keep null */ }
  return Response.json({ id: photo.id, url, fileName: photo.fileName }, { status: 201 });
}
