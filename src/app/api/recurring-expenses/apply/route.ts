import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { addMonths, addQuarters, addYears } from "date-fns";

const schema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
});

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { year, month } = parsed.data;
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd   = new Date(year, month, 0, 23, 59, 59);

  // Find all active recurring expenses due on or before end of this month
  const due = await prisma.recurringExpense.findMany({
    where: { isActive: true, nextDueDate: { lte: periodEnd } },
  });

  const created: string[] = [];

  for (const item of due) {
    const expense = await prisma.expenseEntry.create({
      data: {
        date: periodStart,
        scope: item.scope,
        category: item.category,
        amount: item.amount,
        description: `[Recurring] ${item.description}`,
        propertyId: item.propertyId ?? undefined,
        unitId: item.unitId ?? undefined,
        isSunkCost: false,
        paidFromPettyCash: false,
      },
    });

    created.push(expense.id);

    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "CREATE",
      resource: "ExpenseEntry",
      resourceId: expense.id,
      after: { category: expense.category, amount: expense.amount, source: "recurring", recurringId: item.id },
    });

    // Advance nextDueDate
    let next: Date;
    if (item.frequency === "MONTHLY")   next = addMonths(new Date(item.nextDueDate), 1);
    else if (item.frequency === "QUARTERLY") next = addQuarters(new Date(item.nextDueDate), 1);
    else                                next = addYears(new Date(item.nextDueDate), 1);

    await prisma.recurringExpense.update({
      where: { id: item.id },
      data: { nextDueDate: next },
    });
  }

  return Response.json({ applied: created.length, expenseIds: created });
}
