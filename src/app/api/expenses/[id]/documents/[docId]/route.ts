import { requireExpenseMutation } from "@/lib/expense-access";
import { prisma } from "@/lib/prisma";
import { deleteFromStorage } from "@/lib/supabase-storage";

// ── DELETE /api/expenses/[id]/documents/[docId] ────────────────────────────────
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; docId: string } }
) {
  // Auth + property/org access + CARETAKER own-row rule in one place.
  const { error } = await requireExpenseMutation(params.id, "attach");
  if (error) return error;

  const doc = await prisma.expenseDocument.findUnique({ where: { id: params.docId } });
  if (!doc || doc.expenseId !== params.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
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
