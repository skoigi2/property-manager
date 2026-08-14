import { requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { assertGuestAccess } from "@/lib/guest-access";
import { deleteFromStorage } from "@/lib/supabase-storage";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; docId: string } }
) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const access = await assertGuestAccess(params.id, session!.user.organizationId);
  if (access.error) return access.error;

  const doc = await prisma.guestDocument.findUnique({ where: { id: params.docId } });
  if (!doc || doc.guestId !== params.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  try { await deleteFromStorage(doc.storagePath); } catch { /* ignore storage errors */ }
  await prisma.guestDocument.delete({ where: { id: params.docId } });

  return Response.json({ success: true });
}
