import { requireManager, requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { guestOrgScope } from "@/lib/guest-access";
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
  const { session, error } = await requireManager();
  if (error) return error;
  const orgScope = guestOrgScope(session!.user.organizationId);

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  const guests = await prisma.airbnbGuest.findMany({
    where: {
      AND: [
        orgScope,
        ...(q ? [{
          OR: [
            { name:  { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }] : []),
      ],
    },
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
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = guestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { email, ...rest } = parsed.data;
  const guest = await prisma.airbnbGuest.create({
    data: { ...rest, email: email || null, organizationId: session!.user.organizationId ?? null },
  });

  return Response.json(guest, { status: 201 });
}
