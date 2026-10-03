import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import { authorizeBudget } from "@/lib/service-charge-access";
import { buildServiceChargeView } from "@/lib/service-charge-data";

// One service charge budget: the full view (units + shares, budget vs actual,
// statement), edit (lines replaced atomically), delete.

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authorizeBudget(params.id);
  if (auth.error) return auth.error;
  return Response.json(await buildServiceChargeView(auth.budget));
}

const patchSchema = z.object({
  startMonth: z.number().int().min(1).max(12).optional(),
  basis: z.enum(["FLOOR_AREA", "EQUAL", "CURRENT_CHARGE"]).optional(),
  notes: z.string().max(1000).optional().nullable(),
  lines: z
    .array(
      z.object({
        category: z.enum(EXPENSE_CATEGORIES),
        amount: z.number().min(0),
        notes: z.string().max(200).optional().nullable(),
      }),
    )
    .max(40)
    .optional(),
});

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authorizeBudget(params.id, { write: true });
  if (auth.error) return auth.error;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid budget" }, { status: 400 });
  const { lines, ...fields } = parsed.data;
  if (lines && new Set(lines.map((l) => l.category)).size !== lines.length) {
    return Response.json({ error: "Each category can appear once." }, { status: 400 });
  }
  if (fields.startMonth !== undefined && fields.startMonth !== auth.budget.startMonth && auth.budget.publishedAt) {
    return Response.json({ error: "Unpublish the statements before changing when the year starts." }, { status: 409 });
  }

  const ops = [];
  if (Object.keys(fields).length) ops.push(prisma.serviceChargeBudget.update({ where: { id: params.id }, data: fields }));
  if (lines) {
    ops.push(prisma.serviceChargeBudgetLine.deleteMany({ where: { budgetId: params.id } }));
    ops.push(
      prisma.serviceChargeBudgetLine.createMany({
        data: lines.map((l) => ({ budgetId: params.id, category: l.category, amount: l.amount, notes: l.notes ?? null })),
      }),
    );
  }
  if (ops.length) await prisma.$transaction(ops);

  await logAudit({
    userId: auth.session.user.id,
    userEmail: auth.session.user.email,
    organizationId: auth.budget.organizationId,
    action: "UPDATE",
    resource: "ServiceChargeBudget",
    resourceId: params.id,
    before: { basis: auth.budget.basis, startMonth: auth.budget.startMonth, lines: auth.budget.lines.map((l) => ({ category: l.category, amount: l.amount })) },
    after: parsed.data,
  });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authorizeBudget(params.id, { write: true });
  if (auth.error) return auth.error;
  const balancing = await prisma.invoice.count({ where: { serviceChargeBudgetId: params.id, status: { not: "CANCELLED" } } });
  if (balancing > 0) {
    return Response.json(
      { error: `Balancing invoices were raised from this budget (${balancing}). Cancel them first, or keep the budget as the record.` },
      { status: 409 },
    );
  }
  await prisma.serviceChargeBudget.delete({ where: { id: params.id } });
  await logAudit({
    userId: auth.session.user.id,
    userEmail: auth.session.user.email,
    organizationId: auth.budget.organizationId,
    action: "DELETE",
    resource: "ServiceChargeBudget",
    resourceId: params.id,
    before: { year: auth.budget.year, lines: auth.budget.lines.map((l) => ({ category: l.category, amount: l.amount })) },
  });
  return new Response(null, { status: 204 });
}
