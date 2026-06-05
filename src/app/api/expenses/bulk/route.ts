import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const EXPENSE_CATEGORIES = [
  "SERVICE_CHARGE","MANAGEMENT_FEE","WIFI","WATER","ELECTRICITY",
  "CLEANER","CONSUMABLES","MAINTENANCE","REINSTATEMENT","CAPITAL","OTHER",
] as const;

const bulkSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"),          ids: z.array(z.string()).min(1) }),
  z.object({ action: z.literal("retype"),           ids: z.array(z.string()).min(1), category: z.enum(EXPENSE_CATEGORIES) }),
  z.object({ action: z.literal("mark_sunk"),        ids: z.array(z.string()).min(1) }),
  z.object({ action: z.literal("mark_operating"),   ids: z.array(z.string()).min(1) }),
  // Delete every accessible expense, optionally scoped to one property. No ids
  // are sent from the client — the server resolves them under the access guard.
  z.object({ action: z.literal("delete_all"),       propertyId: z.string().optional() }),
]);

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { action } = parsed.data;

  // delete_all — no client-supplied ids. Resolve the target set server-side,
  // strictly bounded by accessible properties (never a bare PORTFOLIO match,
  // which would cross orgs). PORTFOLIO-scope expenses (no propertyId) are left
  // untouched since they can't be property-scoped safely.
  if (parsed.data.action === "delete_all") {
    const { propertyId } = parsed.data;
    if (propertyId && !propertyIds.includes(propertyId)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const scopeIds = propertyId ? [propertyId] : propertyIds;
    const matches = await prisma.expenseEntry.findMany({
      where: {
        OR: [
          { propertyId: { in: scopeIds } },
          { unit: { propertyId: { in: scopeIds } } },
          { unitAllocations: { some: { unit: { propertyId: { in: scopeIds } } } } },
        ],
      },
      select: { id: true },
    });
    const ids = matches.map((m) => m.id);
    if (ids.length > 0) {
      await prisma.expenseEntry.deleteMany({ where: { id: { in: ids } } });
    }
    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "DELETE",
      resource: "ExpenseEntry",
      resourceId: `delete_all:${propertyId ?? "all"}:${ids.length}`,
      organizationId: session!.user.organizationId,
      before: { propertyId: propertyId ?? null, count: ids.length },
    });
    return Response.json({ success: true, count: ids.length });
  }

  const { ids } = parsed.data;

  // Validate all requested entries belong to accessible properties
  const accessible = await prisma.expenseEntry.findMany({
    where: {
      id: { in: ids },
      OR: [
        { propertyId: { in: propertyIds } },
        { unit: { propertyId: { in: propertyIds } } },
        { unitAllocations: { some: { unit: { propertyId: { in: propertyIds } } } } },
        { scope: "PORTFOLIO" },
      ],
    },
    select: { id: true },
  });

  if (accessible.length !== ids.length) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (action === "delete") {
    await prisma.expenseEntry.deleteMany({ where: { id: { in: ids } } });
    await logAudit({ userId: session!.user.id, userEmail: session!.user.email, action: "DELETE", resource: "ExpenseEntry", resourceId: `bulk:${ids.length}`, organizationId: session!.user.organizationId, before: { ids } });
    return Response.json({ success: true, count: ids.length });
  }

  if (action === "retype") {
    const { category } = parsed.data;
    await prisma.expenseEntry.updateMany({ where: { id: { in: ids } }, data: { category } });
    await logAudit({ userId: session!.user.id, userEmail: session!.user.email, action: "UPDATE", resource: "ExpenseEntry", resourceId: `bulk:${ids.length}`, organizationId: session!.user.organizationId, after: { category } });
    return Response.json({ success: true, count: ids.length });
  }

  if (action === "mark_sunk") {
    await prisma.expenseEntry.updateMany({ where: { id: { in: ids } }, data: { isSunkCost: true } });
    await logAudit({ userId: session!.user.id, userEmail: session!.user.email, action: "UPDATE", resource: "ExpenseEntry", resourceId: `bulk:${ids.length}`, organizationId: session!.user.organizationId, after: { isSunkCost: true } });
    return Response.json({ success: true, count: ids.length });
  }

  if (action === "mark_operating") {
    await prisma.expenseEntry.updateMany({ where: { id: { in: ids } }, data: { isSunkCost: false } });
    await logAudit({ userId: session!.user.id, userEmail: session!.user.email, action: "UPDATE", resource: "ExpenseEntry", resourceId: `bulk:${ids.length}`, organizationId: session!.user.organizationId, after: { isSunkCost: false } });
    return Response.json({ success: true, count: ids.length });
  }
}
