import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { incomeEntrySchema } from "@/lib/validations";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const body = await req.json();
  const parsed = incomeEntrySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { date, checkIn, checkOut, ...rest } = parsed.data;

  const entry = await prisma.incomeEntry.update({
    where: { id: params.id },
    data: {
      ...rest,
      date: new Date(date),
      checkIn: checkIn ? new Date(checkIn) : null,
      checkOut: checkOut ? new Date(checkOut) : null,
    },
    include: { unit: { include: { property: { select: { name: true } } } } },
  });

  return Response.json(entry);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  await prisma.incomeEntry.delete({ where: { id: params.id } });
  return Response.json({ success: true });
}
