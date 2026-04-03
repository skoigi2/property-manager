import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  description: z.string().min(1).optional(),
  category: z.enum([
    "SERVICE_CHARGE","MANAGEMENT_FEE","WIFI","WATER","ELECTRICITY",
    "CLEANER","CONSUMABLES","MAINTENANCE","REINSTATEMENT","CAPITAL","OTHER",
  ]).optional(),
  amount: z.number().positive().optional(),
  frequency: z.enum(["MONTHLY","QUARTERLY","ANNUAL","BIANNUAL"]).optional(),
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

  const item = await prisma.recurringExpense.findUnique({
    where: { id: params.id },
    include: { schedule: { select: { id: true } } },
  });

  if (!item) return Response.json({ error: "Not found" }, { status: 404 });

  if (item.schedule) {
    await prisma.$transaction([
      prisma.assetMaintenanceSchedule.update({
        where: { id: item.schedule.id },
        data: { recurringExpenseId: null },
      }),
      prisma.recurringExpense.delete({ where: { id: params.id } }),
    ]);
  } else {
    await prisma.recurringExpense.delete({ where: { id: params.id } });
  }

  return Response.json({ success: true });
}
