import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { expenseEntrySchema } from "@/lib/validations";

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const unitId = searchParams.get("unitId");
  const propertyId = searchParams.get("propertyId");
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const category = searchParams.get("category");

  let dateFilter = {};
  if (year && month) {
    const from = new Date(parseInt(year), parseInt(month) - 1, 1);
    const to = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59);
    dateFilter = { date: { gte: from, lte: to } };
  }

  // Scope to accessible properties
  const effectivePropertyIds = propertyId && propertyIds.includes(propertyId)
    ? [propertyId]
    : propertyIds;

  const entries = await prisma.expenseEntry.findMany({
    where: {
      OR: [
        { propertyId: { in: effectivePropertyIds } },
        { unit: { propertyId: { in: effectivePropertyIds } } },
      ],
      ...(unitId ? { unitId } : {}),
      ...(category ? { category: category as never } : {}),
      ...dateFilter,
    },
    include: {
      unit: { select: { unitNumber: true } },
      property: { select: { name: true } },
    },
    orderBy: { date: "desc" },
  });

  return Response.json(entries);
}

export async function POST(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const body = await req.json();
  const parsed = expenseEntrySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { date, paidFromPettyCash, ...rest } = parsed.data;
  const parsedDate = new Date(date);

  // Resolve the propertyId for petty cash (needed to scope the OUT entry)
  let pettyCashPropertyId: string | null = null;
  if (paidFromPettyCash) {
    if (rest.propertyId) {
      pettyCashPropertyId = rest.propertyId;
    } else if (rest.unitId) {
      const unit = await prisma.unit.findUnique({
        where: { id: rest.unitId },
        select: { propertyId: true },
      });
      pettyCashPropertyId = unit?.propertyId ?? null;
    }
  }

  // Run expense + optional petty-cash OUT in one transaction
  const [entry] = await prisma.$transaction(async (tx) => {
    const expense = await tx.expenseEntry.create({
      data: { ...rest, paidFromPettyCash: paidFromPettyCash ?? false, date: parsedDate },
      include: {
        unit: { select: { unitNumber: true } },
        property: { select: { name: true } },
      },
    });

    if (paidFromPettyCash) {
      await tx.pettyCash.create({
        data: {
          date: parsedDate,
          type: "OUT",
          amount: rest.amount,
          description: rest.description ?? `${rest.category} expense`,
          propertyId: pettyCashPropertyId,
        },
      });
    }

    return [expense];
  });

  return Response.json(entry, { status: 201 });
}
