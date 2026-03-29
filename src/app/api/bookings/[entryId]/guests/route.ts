import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET(_req: Request, { params }: { params: { entryId: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const bookingGuests = await prisma.bookingGuest.findMany({
    where: { incomeEntryId: params.entryId },
    include: {
      guest: {
        include: {
          documents: { orderBy: { uploadedAt: "desc" } },
          _count: { select: { bookings: true } },
        },
      },
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });

  return Response.json(bookingGuests);
}

const linkSchema = z.object({
  guestId:   z.string().optional(), // link existing guest
  isPrimary: z.boolean().default(false),
  // fields for creating a new guest inline
  name:           z.string().min(1).optional(),
  email:          z.string().email().optional().or(z.literal("")),
  phone:          z.string().optional(),
  nationality:    z.string().optional(),
  passportNumber: z.string().optional(),
  preferences:    z.string().optional(),
});

export async function POST(req: Request, { params }: { params: { entryId: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = linkSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { guestId, isPrimary, email, name, ...rest } = parsed.data;

  let resolvedGuestId: string;

  if (guestId) {
    // Link existing guest
    const exists = await prisma.airbnbGuest.findUnique({ where: { id: guestId }, select: { id: true } });
    if (!exists) return Response.json({ error: "Guest not found" }, { status: 404 });
    resolvedGuestId = guestId;
  } else {
    // Create new guest
    if (!name) return Response.json({ error: "name is required when creating a new guest" }, { status: 400 });
    const newGuest = await prisma.airbnbGuest.create({
      data: { name, email: email || null, ...rest },
    });
    resolvedGuestId = newGuest.id;
  }

  // Check not already linked
  const existing = await prisma.bookingGuest.findUnique({
    where: { guestId_incomeEntryId: { guestId: resolvedGuestId, incomeEntryId: params.entryId } },
  });
  if (existing) return Response.json({ error: "Guest already linked to this booking" }, { status: 409 });

  const bookingGuest = await prisma.bookingGuest.create({
    data: { guestId: resolvedGuestId, incomeEntryId: params.entryId, isPrimary },
    include: {
      guest: {
        include: {
          documents: { orderBy: { uploadedAt: "desc" } },
          _count: { select: { bookings: true } },
        },
      },
    },
  });

  return Response.json(bookingGuest, { status: 201 });
}
