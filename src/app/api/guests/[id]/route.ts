import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  name:           z.string().min(1).optional(),
  email:          z.string().email().optional().or(z.literal("")),
  phone:          z.string().optional(),
  nationality:    z.string().optional(),
  passportNumber: z.string().optional(),
  preferences:    z.string().optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const guest = await prisma.airbnbGuest.findUnique({
    where: { id: params.id },
    include: {
      documents: { orderBy: { uploadedAt: "desc" } },
      bookings: {
        include: {
          incomeEntry: {
            select: { id: true, date: true, checkIn: true, checkOut: true, grossAmount: true, unit: { select: { unitNumber: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!guest) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(guest);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { email, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (email !== undefined) data.email = email || null;

  const guest = await prisma.airbnbGuest.update({ where: { id: params.id }, data });
  return Response.json(guest);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  await prisma.airbnbGuest.delete({ where: { id: params.id } });
  return Response.json({ success: true });
}
