import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { uploadToStorage, getSignedUrl } from "@/lib/supabase-storage";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const report = await prisma.conditionReport.findUnique({
    where: { id: params.id },
    select: { id: true, propertyId: true, tenantDocumentId: true },
  });
  if (!report) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(report.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (report.tenantDocumentId) {
    return Response.json({ error: "Report finalised — cannot upload more photos" }, { status: 409 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "File too large (max 8 MB)" }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return Response.json({ error: "Unsupported image type" }, { status: 400 });
  }

  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "photo";
  const storagePath = `condition-reports/${report.id}/${Date.now()}-${safeFileName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await uploadToStorage(storagePath, buffer, file.type);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "upload failed";
    return Response.json({ error: `Storage upload failed: ${msg}` }, { status: 500 });
  }

  const photo = await prisma.conditionReportPhoto.create({
    data: {
      reportId: report.id,
      storagePath,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
    },
  });

  let url: string | null = null;
  try { url = await getSignedUrl(storagePath); } catch { /* keep null */ }

  return Response.json({ id: photo.id, url, fileName: photo.fileName }, { status: 201 });
}
