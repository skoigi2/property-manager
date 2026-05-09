import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { uploadToStorage, getSignedUrl, BUCKET } from "@/lib/supabase-storage";
import { DocumentCategory } from "@prisma/client";

// ── GET /api/documents/[tenantId] ─────────────────────────────────────────────
// Returns all documents for a tenant with short-lived signed download URLs.

export async function GET(
  _req: Request,
  { params }: { params: { tenantId: string } }
) {
  try {
    const { error } = await requireAuth();
    if (error) return error;

    const accessibleIds = await getAccessiblePropertyIds();
    if (!accessibleIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const tenant = await prisma.tenant.findUnique({
      where: { id: params.tenantId },
      include: { unit: true },
    });
    if (!tenant || !accessibleIds.includes(tenant.unit.propertyId)) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const docs = await prisma.tenantDocument.findMany({
      where: { tenantId: params.tenantId },
      orderBy: { uploadedAt: "desc" },
    });

    const withUrls = await Promise.all(
      docs.map(async (doc) => {
        let url: string | null = null;
        try {
          url = await getSignedUrl(doc.storagePath);
        } catch {
          // storage unavailable — return null url, client shows disabled button
        }
        return { ...doc, url };
      })
    );

    return Response.json(withUrls);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[GET /api/documents/[tenantId]]", message, stack);
    return Response.json(
      { error: "Server error", detail: message, code: (e as { code?: string })?.code ?? null },
      { status: 500 }
    );
  }
}

// ── POST /api/documents/[tenantId] ────────────────────────────────────────────
// Accepts a multipart/form-data with: file, category, label

export async function POST(
  req: Request,
  { params }: { params: { tenantId: string } }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const accessibleIds = await getAccessiblePropertyIds();
  if (!accessibleIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    include: { unit: true },
  });
  if (!tenant || !accessibleIds.includes(tenant.unit.propertyId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const category = (formData.get("category") as string) ?? "OTHER";
  const label = (formData.get("label") as string) ?? "";

  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  const maxMb = 10;
  if (file.size > maxMb * 1024 * 1024) {
    return Response.json({ error: `File too large (max ${maxMb} MB)` }, { status: 400 });
  }

  const allowedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  if (!allowedTypes.includes(file.type)) {
    return Response.json({ error: "Unsupported file type" }, { status: 400 });
  }

  // Build storage path: tenants/{tenantId}/{timestamp}-{filename}
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `tenants/${params.tenantId}/${Date.now()}-${safeFileName}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await uploadToStorage(storagePath, buffer, file.type);
  } catch (e: any) {
    return Response.json({ error: `Storage upload failed: ${e.message}` }, { status: 500 });
  }

  const doc = await prisma.tenantDocument.create({
    data: {
      tenantId: params.tenantId,
      category: category as DocumentCategory,
      label: label || file.name,
      fileName: file.name,
      storagePath,
      fileSize: file.size,
      mimeType: file.type,
    },
  });

  return Response.json(doc, { status: 201 });
}
