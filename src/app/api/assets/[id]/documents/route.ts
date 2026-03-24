import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "property-documents";

function getStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase storage not configured");
  return createClient(url, key);
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const asset = await prisma.asset.findUnique({
    where: { id: params.id },
    select: { propertyId: true },
  });

  if (!asset) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(asset.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const documents = await prisma.assetDocument.findMany({
      where: { assetId: params.id },
      orderBy: { uploadedAt: "desc" },
    });
    return Response.json(documents);
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const asset = await prisma.asset.findUnique({
    where: { id: params.id },
    select: { propertyId: true },
  });

  if (!asset) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(asset.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const label = (formData.get("label") as string) || "";

  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  const maxMb = 10;
  if (file.size > maxMb * 1024 * 1024) {
    return Response.json({ error: `File too large (max ${maxMb} MB)` }, { status: 400 });
  }

  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `assets/${params.id}/${Date.now()}_${safeFileName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  let fileUrl: string;
  try {
    const supabase = getStorageClient();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    fileUrl = urlData.publicUrl;
  } catch (err: any) {
    return Response.json({ error: `Storage upload failed: ${err.message}` }, { status: 500 });
  }

  try {
    const doc = await prisma.assetDocument.create({
      data: {
        assetId: params.id,
        label: label || file.name,
        fileName: file.name,
        fileUrl,
        fileSize: file.size,
        mimeType: file.type,
      },
    });
    return Response.json(doc, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
