import { requireOpsStaffWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { deleteFromStorage } from "@/lib/supabase-storage";
import { isInspectionManager } from "@/lib/inspections";
import { loadStay, serializeStay } from "@/lib/stays";

// Delete a guest ID upload from a stay: managers any, a caretaker only their own.
export async function DELETE(_req: Request, props: { params: Promise<{ id: string; guestId: string; docId: string }> }) {
  const params = await props.params;
  const { session, error } = await requireOpsStaffWrite();
  if (error) return error;
  const loaded = await loadStay(params.id);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });
  if (!loaded.entry.bookingGuests.some((bg) => bg.guest.id === params.guestId)) {
    return Response.json({ error: "Guest not found on this stay" }, { status: 404 });
  }
  const doc = await prisma.guestDocument.findUnique({ where: { id: params.docId } });
  if (!doc || doc.guestId !== params.guestId) return Response.json({ error: "Document not found" }, { status: 404 });
  if (!isInspectionManager(session!) && doc.uploadedByUserId !== session!.user.id) {
    return Response.json({ error: "You can only delete documents you uploaded." }, { status: 403 });
  }

  await prisma.guestDocument.delete({ where: { id: doc.id } });
  try { await deleteFromStorage(doc.storagePath); } catch { /* best-effort */ }
  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "DELETE",
    resource: "GuestDocument",
    resourceId: doc.id,
    organizationId: loaded.entry.unit.property.organizationId,
    before: { guestId: doc.guestId, label: doc.label, bookingId: loaded.entry.id },
  });

  const reloaded = await loadStay(loaded.entry.id);
  if (!reloaded.ok) return Response.json({ error: reloaded.error }, { status: reloaded.status });
  return Response.json(await serializeStay(reloaded.entry, session!));
}
