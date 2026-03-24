import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { deleteFromStorage } from "@/lib/supabase-storage";

// ── DELETE /api/documents/[tenantId]/[docId] ──────────────────────────────────

export async function DELETE(
  _req: Request,
  { params }: { params: { tenantId: string; docId: string } }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const accessibleIds = await getAccessiblePropertyIds();
  if (!accessibleIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const doc = await prisma.tenantDocument.findUnique({
    where: { id: params.docId },
    include: { tenant: { include: { unit: true } } },
  });

  if (!doc || doc.tenantId !== params.tenantId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (!accessibleIds.includes(doc.tenant.unit.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Delete from Supabase storage (best effort — still delete DB record)
  try {
    await deleteFromStorage(doc.storagePath);
  } catch {
    // log but continue
  }

  await prisma.tenantDocument.delete({ where: { id: params.docId } });

  return new Response(null, { status: 204 });
}
