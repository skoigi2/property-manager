import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const guestSchema = z.object({
  name:           z.string().min(1),
  email:          z.string().email().optional().or(z.literal("")),
  phone:          z.string().optional(),
  nationality:    z.string().optional(),
  passportNumber: z.string().optional(),
  preferences:    z.string().optional(),
});

export async function GET(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  const guests = await prisma.airbnbGuest.findMany({
    where: q ? {
      OR: [
        { name:  { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    } : undefined,
    include: {
      _count: { select: { bookings: true } },
      documents: { select: { id: true, label: true, fileName: true, fileSize: true, uploadedAt: true } },
    },
    orderBy: { name: "asc" },
    take: 20,
  });

  return Response.json(guests);
}

export async function POST(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = guestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { email, ...rest } = parsed.data;
  const guest = await prisma.airbnbGuest.create({
    data: { ...rest, email: email || null },
  });

  return Response.json(guest, { status: 201 });
}
