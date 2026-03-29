import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  { params }: { params: { entryId: string; guestId: string } }
) {
  const { error } = await requireManager();
  if (error) return error;

  const record = await prisma.bookingGuest.findUnique({
    where: { guestId_incomeEntryId: { guestId: params.guestId, incomeEntryId: params.entryId } },
  });
  if (!record) return Response.json({ error: "Not found" }, { status: 404 });

  await prisma.bookingGuest.delete({
    where: { guestId_incomeEntryId: { guestId: params.guestId, incomeEntryId: params.entryId } },
  });

  // Guest profile is NOT deleted — only unlinked from this booking
  return Response.json({ success: true });
}
