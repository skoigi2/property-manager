import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { deleteFromStorage } from "@/lib/supabase-storage";

// ── DELETE /api/expenses/[id]/documents/[docId] ────────────────────────────────
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; docId: string } }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const doc = await prisma.expenseDocument.findUnique({
    where: { id: params.docId },
    include: {
      expense: {
        include: { unit: { select: { propertyId: true } } },
      },
    },
  });

  if (!doc || doc.expenseId !== params.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const resolvedPropertyId =
    doc.expense.propertyId ?? doc.expense.unit?.propertyId ?? null;

  if (resolvedPropertyId) {
    const accessibleIds = await getAccessiblePropertyIds();
    if (!accessibleIds || !accessibleIds.includes(resolvedPropertyId)) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
  } else {
    const { error: mgErr } = await requireManager();
    if (mgErr) return mgErr;
  }

  // Best-effort storage deletion
  try {
    await deleteFromStorage(doc.storagePath);
  } catch {
    // storage unavailable — still delete the DB record
  }

  await prisma.expenseDocument.delete({ where: { id: params.docId } });

  return new Response(null, { status: 204 });
}
