import { z } from "zod";
import { requireManager, requireManagerWrite, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";

// Service charge budgets for a property: list and create.

export async function GET(req: Request) {
  const { error } = await requireManager();
  if (error) return error;
  const propertyId = new URL(req.url).searchParams.get("propertyId");
  if (!propertyId) return Response.json({ error: "propertyId required" }, { status: 400 });
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  const budgets = await prisma.serviceChargeBudget.findMany({
    where: { propertyId },
    orderBy: { year: "desc" },
    include: { lines: { select: { amount: true } }, _count: { select: { balancingInvoices: true } } },
  });
  return Response.json(
    budgets.map((b) => ({
      id: b.id,
      year: b.year,
      startMonth: b.startMonth,
      basis: b.basis,
      publishedAt: b.publishedAt,
      total: Math.round(b.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100,
      balancingInvoices: b._count.balancingInvoices,
    })),
  );
}

const lineSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().min(0),
  notes: z.string().max(200).optional().nullable(),
});

const createSchema = z.object({
  propertyId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  /** Omitted: the previous budget's start month when copying, else January. */
  startMonth: z.number().int().min(1).max(12).optional(),
  basis: z.enum(["FLOOR_AREA", "EQUAL", "CURRENT_CHARGE"]).default("FLOOR_AREA"),
  lines: z.array(lineSchema).max(40).optional(),
  /** Copy the lines of the property's previous budget (ignored when `lines` is sent). */
  copyPrevious: z.boolean().optional(),
});

export async function POST(req: Request) {
  const { error, session } = await requireManagerWrite();
  if (error) return error;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid budget" }, { status: 400 });
  const { propertyId, year, basis, copyPrevious } = parsed.data;
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { type: true, organizationId: true } });
  if (!property) return Response.json({ error: "Not found" }, { status: 404 });
  if (property.type !== "LONGTERM") {
    return Response.json({ error: "Service charge budgets are for long-term (apartment) properties." }, { status: 400 });
  }
  const existing = await prisma.serviceChargeBudget.findUnique({ where: { propertyId_year: { propertyId, year } }, select: { id: true } });
  if (existing) return Response.json({ error: `There is already a ${year} budget for this property.`, id: existing.id }, { status: 409 });

  const prev = copyPrevious
    ? await prisma.serviceChargeBudget.findFirst({
        where: { propertyId, year: { lt: year } },
        orderBy: { year: "desc" },
        include: { lines: true },
      })
    : null;
  const startMonth = parsed.data.startMonth ?? prev?.startMonth ?? 1;
  let lines = parsed.data.lines ?? [];
  if (!parsed.data.lines && prev) {
    lines = prev.lines.map((l) => ({ category: l.category, amount: l.amount, notes: l.notes }));
  }
  const seen = new Set<string>();
  lines = lines.filter((l) => (seen.has(l.category) ? false : (seen.add(l.category), true)));

  const budget = await prisma.serviceChargeBudget.create({
    data: {
      propertyId,
      organizationId: property.organizationId,
      year,
      startMonth,
      basis,
      createdByName: session!.user.name ?? session!.user.email ?? null,
      lines: { create: lines.map((l) => ({ category: l.category, amount: l.amount, notes: l.notes ?? null })) },
    },
  });
  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    organizationId: property.organizationId,
    action: "CREATE",
    resource: "ServiceChargeBudget",
    resourceId: budget.id,
    after: { propertyId, year, startMonth, basis, lines },
  });
  return Response.json({ id: budget.id }, { status: 201 });
}
