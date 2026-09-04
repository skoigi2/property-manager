import { requireAuth, getAccessiblePropertyIds, requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { uploadToStorage } from "@/lib/supabase-storage";
import { DOCUMENT_MAX_MB, documentStoragePath, isAllowedDocumentFile } from "@/lib/document-files";
import { isAssetDocumentCategory } from "@/lib/asset-documents";
import { withSignedDocumentUrls } from "@/lib/entity-document-urls";
import type { AssetDocumentCategory } from "@prisma/client";

async function loadAsset(id: string) {
  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  const asset = await prisma.asset.findUnique({ where: { id }, select: { propertyId: true, name: true } });
  if (!asset) return { error: Response.json({ error: "Not found" }, { status: 404 }) };
  if (!propertyIds.includes(asset.propertyId)) return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  return { asset };
}

/** GET — documents on an asset, `fileUrl` already signed (or the legacy public URL). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAuth();
  if (error) return error;
  const loaded = await loadAsset(params.id);
  if (loaded.error) return loaded.error;

  const documents = await prisma.assetDocument.findMany({
    where: { assetId: params.id },
    orderBy: { uploadedAt: "desc" },
  });
  return Response.json(await withSignedDocumentUrls(documents));
}

/** POST — multipart `file` + `category` + `label` + optional `documentDate` (YYYY-MM-DD). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;
  const loaded = await loadAsset(params.id);
  if (loaded.error) return loaded.error;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const label = ((formData.get("label") as string) || "").trim();
  const categoryRaw = (formData.get("category") as string) || "OTHER";
  const documentDateRaw = ((formData.get("documentDate") as string) || "").trim();

  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });
  if (file.size > DOCUMENT_MAX_MB * 1024 * 1024) {
    return Response.json(
      { error: `"${file.name}" is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB) — the maximum is ${DOCUMENT_MAX_MB} MB per file.` },
      { status: 400 },
    );
  }
  if (!isAllowedDocumentFile(file)) {
    return Response.json(
      { error: `"${file.name}" is not a supported file type. Upload a PDF, an image, or a Word / Excel document.` },
      { status: 400 },
    );
  }
  if (!isAssetDocumentCategory(categoryRaw)) {
    return Response.json({ error: "Unknown document category" }, { status: 400 });
  }
  let documentDate: Date | null = null;
  if (documentDateRaw) {
    documentDate = new Date(documentDateRaw);
    if (isNaN(documentDate.getTime())) return Response.json({ error: "Invalid document date" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = documentStoragePath("assets", params.id, file.name);
  try {
    await uploadToStorage(storagePath, buffer, file.type || "application/octet-stream");
  } catch (e: any) {
    // Private bucket not reachable — nothing was written, so tell the client to retry later.
    return Response.json({ error: `Storage is unavailable right now: ${e.message}`, code: "STORAGE_UNAVAILABLE" }, { status: 503 });
  }

  const doc = await prisma.assetDocument.create({
    data: {
      assetId: params.id,
      category: categoryRaw as AssetDocumentCategory,
      label: label || file.name,
      fileName: file.name,
      fileUrl: storagePath,
      fileSize: file.size,
      mimeType: file.type || null,
      documentDate,
      uploadedByEmail: session!.user.email ?? null,
      uploadedByName: session!.user.name ?? null,
    },
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "CREATE",
    resource: "AssetDocument",
    resourceId: doc.id,
    organizationId: session!.user.organizationId,
    after: { assetId: params.id, asset: loaded.asset!.name, category: doc.category, label: doc.label, fileName: doc.fileName, fileSize: doc.fileSize },
  });

  const [signed] = await withSignedDocumentUrls([doc]);
  return Response.json(signed, { status: 201 });
}
