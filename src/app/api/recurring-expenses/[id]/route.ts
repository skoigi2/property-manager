import { requireManagerWrite, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";

const patchSchema = z.object({
  description: z.string().min(1).optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  amount: z.number().positive().optional(),
  frequency: z.enum(["MONTHLY","QUARTERLY","ANNUAL","BIANNUAL"]).optional(),
  nextDueDate: z.string().optional(),
  isActive: z.boolean().optional(),
  vendorId: z.string().nullable().optional(),
});

// Property-linked templates are gated by property access; PORTFOLIO templates
// (no property/unit) are gated by owning org — another org's row must look like
// it doesn't exist. Legacy null-org rows are grandfathered; super-admin (session
// org null) passes. Returns { error: Response } to short-circuit, or
// { error: null, item } with the pre-fetched row when access is allowed.
async function assertRecurringAccess(
  id: string,
  sessionOrgId: string | null | undefined,
): Promise<{ error: Response } | { error: null; item: { id: string; organizationId: string | null; schedule: { id: string } | null } }> {
  const item = await prisma.recurringExpense.findUnique({
    where: { id },
    select: {
      id: true,
      organizationId: true,
      propertyId: true,
      unit: { select: { propertyId: true } },
      schedule: { select: { id: true } },
    },
  });
  if (!item) return { error: Response.json({ error: "Not found" }, { status: 404 }) };

  const propertyId = item.propertyId ?? item.unit?.propertyId ?? null;
  if (propertyId) {
    const access = await requirePropertyAccess(propertyId);
    if (!access.ok) return { error: access.error! };
  } else if (item.organizationId && sessionOrgId && item.organizationId !== sessionOrgId) {
    return { error: Response.json({ error: "Not found" }, { status: 404 }) };
  }
  return { error: null, item: { id: item.id, organizationId: item.organizationId, schedule: item.schedule } };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const access = await assertRecurringAccess(params.id, session!.user.organizationId);
  if (access.error) return access.error;

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
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const access = await assertRecurringAccess(params.id, session!.user.organizationId);
  if (access.error) return access.error;
  const item = access.item;

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
