import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  description: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  nextDueDate: z.string().optional(),
  isActive: z.boolean().optional(),
  vendorId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { nextDueDate, ...rest } = parsed.data;
  const item = await prisma.recurringExpense.update({
    where: { id: params.id },
    data: { ...rest, ...(nextDueDate ? { nextDueDate: new Date(nextDueDate) } : {}) },
    include: {
      property: { select: { name: true } },
      unit: { select: { unitNumber: true } },
      vendor: { select: { id: true, name: true, category: true } },
    },
  });

  return Response.json(item);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  await prisma.recurringExpense.delete({ where: { id: params.id } });
  return Response.json({ success: true });
}
