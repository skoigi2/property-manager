import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "property-documents";

function getStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase storage not configured");
  return createClient(url, key);
}

function storagePathFromUrl(fileUrl: string): string | null {
  try {
    const url = new URL(fileUrl);
    const marker = `/object/public/${BUCKET}/`;
    const idx = url.pathname.indexOf(marker);
    if (idx === -1) return null;
    return url.pathname.slice(idx + marker.length);
  } catch {
    return null;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; docId: string } }
) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const doc = await prisma.assetDocument.findUnique({
    where: { id: params.docId },
    include: { asset: { select: { propertyId: true } } },
  });

  if (!doc) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(doc.asset.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Delete from storage (best effort)
  try {
    const storagePath = storagePathFromUrl(doc.fileUrl);
    if (storagePath) {
      const supabase = getStorageClient();
      await supabase.storage.from(BUCKET).remove([storagePath]);
    }
  } catch {
    // Non-fatal
  }

  try {
    await prisma.assetDocument.delete({ where: { id: params.docId } });
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
