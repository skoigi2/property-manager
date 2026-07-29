import { requireManagerWrite, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";

const schema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().min(1).max(500).optional(),
});

// ── POST /api/petty-cash/[id]/convert-to-expense ─────────────────────────────
// Promotes a manual (unlinked) petty-cash OUT row into a real ExpenseEntry so
// the spend appears in the P&L, then links the two. The expense is created as
// fully paid in cash (the money already left the box) and the petty row keeps
// its history — this is the migration path for spending that was recorded on
// the Petty Cash page instead of the Expenses page.
//
// Deliberately does NOT go through POST /api/expenses: that route would mint a
// SECOND petty-cash OUT row for a paidFromPettyCash expense and double-count
// the float.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const petty = await prisma.pettyCash.findUnique({ where: { id: params.id } });
  if (!petty) return Response.json({ error: "Not found" }, { status: 404 });

  if (petty.propertyId) {
    const access = await requirePropertyAccess(petty.propertyId);
    if (!access.ok) return access.error!;
  } else if (
    petty.organizationId &&
    session!.user.organizationId &&
    petty.organizationId !== session!.user.organizationId
  ) {
    // Another org's property-less row must look like it doesn't exist.
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (petty.type !== "OUT") {
    return Response.json({ error: "Only Cash Out entries can be converted to an expense." }, { status: 400 });
  }
  if (petty.expenseEntryId) {
    return Response.json({ error: "This entry is already linked to an expense." }, { status: 409 });
  }
  if (petty.status === "REJECTED") {
    return Response.json({ error: "A rejected entry can't be converted — approve it first or delete it." }, { status: 400 });
  }

  // Sequential writes with manual cleanup — callback-form $transaction is
  // pgBouncer-incompatible (see CLAUDE.md), and the second write needs the
  // first's id.
  const expense = await prisma.expenseEntry.create({
    data: {
      date: petty.date,
      scope: petty.propertyId ? "PROPERTY" : "PORTFOLIO",
      propertyId: petty.propertyId,
      category: parsed.data.category,
      amount: petty.amount,
      description: parsed.data.description ?? petty.description,
      paidFromPettyCash: true,
      // Cash already left the box — the expense is settled.
      amountPaid: petty.amount,
      paymentMethod: "CASH",
      paymentDate: petty.date,
      paymentReference: petty.receiptRef,
      organizationId: petty.organizationId ?? session!.user.organizationId ?? null,
    },
  });

  try {
    await prisma.pettyCash.update({
      where: { id: petty.id },
      data: { expenseEntryId: expense.id },
    });
  } catch (e) {
    // Linking failed — remove the orphan expense so nothing double-counts.
    await prisma.expenseEntry.delete({ where: { id: expense.id } }).catch(() => {});
    throw e;
  }

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "CREATE",
    resource: "ExpenseEntry",
    resourceId: expense.id,
    organizationId: session!.user.organizationId,
    after: {
      convertedFromPettyCash: petty.id,
      category: parsed.data.category,
      amount: petty.amount,
      date: petty.date,
    },
  });

  return Response.json({ ok: true, expenseId: expense.id }, { status: 201 });
}
