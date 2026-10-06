import { requireOpsStaffWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { stayGuestSchema } from "@/lib/validations";
import { loadStay, serializeStay } from "@/lib/stays";

// Add a guest to a stay on site (ops staff incl. CARETAKER). A returning
// guest is matched on the ID / passport number within the organisation and
// linked rather than duplicated. The first guest added is the main guest.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, error } = await requireOpsStaffWrite();
  if (error) return error;
  const loaded = await loadStay(params.id);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });
  const entry = loaded.entry;

  const parsed = stayGuestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const { name, phone, nationality, idNumber } = parsed.data;
  const orgId = entry.unit.property.organizationId;

  const existing = idNumber && orgId
    ? await prisma.airbnbGuest.findFirst({
        where: { organizationId: orgId, passportNumber: { equals: idNumber, mode: "insensitive" } },
        select: { id: true, phone: true, nationality: true },
      })
    : null;
  if (existing && entry.bookingGuests.some((bg) => bg.guest.id === existing.id)) {
    return Response.json({ error: "That guest is already on this stay." }, { status: 409 });
  }
  const guest = existing
    ? await prisma.airbnbGuest.update({
        where: { id: existing.id },
        // Fill gaps only — never overwrite what the manager recorded.
        data: { ...(!existing.phone && phone ? { phone } : {}), ...(!existing.nationality && nationality ? { nationality } : {}) },
        select: { id: true },
      })
    : await prisma.airbnbGuest.create({
        data: { name, phone: phone || null, nationality: nationality || null, passportNumber: idNumber || null, organizationId: orgId },
        select: { id: true },
      });

  const isPrimary = parsed.data.isPrimary ?? entry.bookingGuests.length === 0;
  await prisma.$transaction([
    ...(isPrimary ? [prisma.bookingGuest.updateMany({ where: { incomeEntryId: entry.id }, data: { isPrimary: false } })] : []),
    prisma.bookingGuest.create({ data: { guestId: guest.id, incomeEntryId: entry.id, isPrimary } }),
  ]);

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "CREATE",
    resource: "BookingGuest",
    resourceId: entry.id,
    organizationId: orgId,
    after: { guestId: guest.id, matchedExisting: !!existing, isPrimary },
  });

  const reloaded = await loadStay(entry.id);
  if (!reloaded.ok) return Response.json({ error: reloaded.error }, { status: reloaded.status });
  return Response.json(await serializeStay(reloaded.entry, session!), { status: 201 });
}
