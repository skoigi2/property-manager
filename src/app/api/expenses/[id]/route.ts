import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { expenseEntrySchema } from "@/lib/validations";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const body = await req.json();
  const parsed = expenseEntrySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { date, ...rest } = parsed.data;

  const entry = await prisma.expenseEntry.update({
    where: { id: params.id },
    data: { ...rest, date: new Date(date) },
    include: {
      unit: { select: { unitNumber: true } },
      property: { select: { name: true } },
    },
  });

  return Response.json(entry);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  await prisma.expenseEntry.delete({ where: { id: params.id } });
  return Response.json({ success: true });
}
