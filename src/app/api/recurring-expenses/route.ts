import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { requireActiveSubscription } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";

const schema = z.object({
  description: z.string().min(1),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().positive(),
  scope: z.enum(["UNIT","PROPERTY","PORTFOLIO"]),
  propertyId: z.string().optional().nullable(),
  unitId: z.string().optional().nullable(),
  frequency: z.enum(["MONTHLY","QUARTERLY","ANNUAL","BIANNUAL"]).default("MONTHLY"),
  nextDueDate: z.string(),
  vendorId: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const sessionOrgId = session!.user.organizationId ?? null;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const filterPropertyId = searchParams.get("propertyId");
  const effectivePropertyIds =
    filterPropertyId && propertyIds.includes(filterPropertyId)
      ? [filterPropertyId]
      : propertyIds;

  const items = await prisma.recurringExpense.findMany({
    where: {
      OR: [
        { propertyId: { in: effectivePropertyIds } },
        { unit: { propertyId: { in: effectivePropertyIds } } },
        // PORTFOLIO templates carry no property/unit — scope them by owning org
        // instead of returning every org's templates. Legacy null-org rows stay
        // visible; super-admin (session org null) sees all.
        {
          AND: [
            { propertyId: null },
            { unitId: null },
            ...(sessionOrgId ? [{ OR: [{ organizationId: sessionOrgId }, { organizationId: null }] }] : []),
          ],
        },
      ],
    },
    include: {
      property: { select: { name: true } },
      unit: { select: { unitNumber: true } },
      vendor: { select: { id: true, name: true, category: true } },
      schedule: {
        select: {
          id: true,
          taskName: true,
          asset: { select: { id: true, name: true, category: true } },
          property: { select: { name: true } },
        },
      },
    },
    orderBy: { nextDueDate: "asc" },
  });

  return Response.json(items);
}

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;
  const locked = await requireActiveSubscription(session!.user.organizationId);
  if (locked) return locked;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { nextDueDate, ...rest } = parsed.data;
  const item = await prisma.recurringExpense.create({
    data: { ...rest, nextDueDate: new Date(nextDueDate), organizationId: session!.user.organizationId ?? null },
    include: {
      property: { select: { name: true } },
      unit: { select: { unitNumber: true } },
      vendor: { select: { id: true, name: true, category: true } },
    },
  });

  return Response.json(item, { status: 201 });
}
