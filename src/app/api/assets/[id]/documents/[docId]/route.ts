import { getAccessiblePropertyIds, requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { removeStoredDocumentFile } from "@/lib/entity-document-urls";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; docId: string } }
) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const doc = await prisma.assetDocument.findUnique({
    where: { id: params.docId },
    include: { asset: { select: { propertyId: true, name: true } } },
  });

  if (!doc || doc.assetId !== params.id) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(doc.asset.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await removeStoredDocumentFile(doc.fileUrl);

  try {
    await prisma.assetDocument.delete({ where: { id: params.docId } });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "DELETE",
    resource: "AssetDocument",
    resourceId: params.docId,
    organizationId: session!.user.organizationId,
    before: { assetId: doc.assetId, asset: doc.asset.name, category: doc.category, label: doc.label, fileName: doc.fileName },
  });

  return Response.json({ success: true });
}
