import { requireAuth, getAccessiblePropertyIds, requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { uploadToStorage } from "@/lib/supabase-storage";
import {
  INSURANCE_DOCUMENT_MAX_MB,
  isAllowedInsuranceDocument,
  isInsuranceDocumentCategory,
  insuranceStoragePath,
} from "@/lib/insurance-documents";
import { withSignedDocumentUrls } from "@/lib/entity-document-urls";
import type { InsuranceDocumentCategory } from "@prisma/client";

async function loadPolicy(id: string) {
  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  const policy = await prisma.insurancePolicy.findUnique({ where: { id }, select: { propertyId: true, insurer: true, policyNumber: true } });
  if (!policy) return { error: Response.json({ error: "Not found" }, { status: 404 }) };
  if (!propertyIds.includes(policy.propertyId)) return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  return { policy };
}

/** GET — documents on a policy, `fileUrl` already signed (or the legacy public URL). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAuth();
  if (error) return error;
  const loaded = await loadPolicy(params.id);
  if (loaded.error) return loaded.error;

  const documents = await prisma.insurancePolicyDocument.findMany({
    where: { policyId: params.id },
    orderBy: { uploadedAt: "desc" },
  });
  return Response.json(await withSignedDocumentUrls(documents));
}

/** POST — multipart `file` + `category` + `label` + optional `documentDate` (YYYY-MM-DD). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;
  const loaded = await loadPolicy(params.id);
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
  if (file.size > INSURANCE_DOCUMENT_MAX_MB * 1024 * 1024) {
    return Response.json(
      { error: `"${file.name}" is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB) — the maximum is ${INSURANCE_DOCUMENT_MAX_MB} MB per file.` },
      { status: 400 },
    );
  }
  if (!isAllowedInsuranceDocument(file)) {
    return Response.json(
      { error: `"${file.name}" is not a supported file type. Upload a PDF, an image, or a Word / Excel document.` },
      { status: 400 },
    );
  }
  if (!isInsuranceDocumentCategory(categoryRaw)) {
    return Response.json({ error: "Unknown document category" }, { status: 400 });
  }
  let documentDate: Date | null = null;
  if (documentDateRaw) {
    documentDate = new Date(documentDateRaw);
    if (isNaN(documentDate.getTime())) return Response.json({ error: "Invalid document date" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = insuranceStoragePath(params.id, file.name);
  try {
    await uploadToStorage(storagePath, buffer, file.type || "application/octet-stream");
  } catch (e: any) {
    // Private bucket not reachable — nothing was written, so tell the client to retry later.
    return Response.json({ error: `Storage is unavailable right now: ${e.message}`, code: "STORAGE_UNAVAILABLE" }, { status: 503 });
  }

  const doc = await prisma.insurancePolicyDocument.create({
    data: {
      policyId: params.id,
      category: categoryRaw as InsuranceDocumentCategory,
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
    resource: "InsurancePolicyDocument",
    resourceId: doc.id,
    organizationId: session!.user.organizationId,
    after: { policyId: params.id, policyNumber: loaded.policy!.policyNumber, category: doc.category, label: doc.label, fileName: doc.fileName, fileSize: doc.fileSize },
  });

  const [signed] = await withSignedDocumentUrls([doc]);
  return Response.json(signed, { status: 201 });
}
