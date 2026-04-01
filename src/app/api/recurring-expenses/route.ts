import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  description: z.string().min(1),
  category: z.enum([
    "SERVICE_CHARGE","MANAGEMENT_FEE","WIFI","WATER","ELECTRICITY",
    "CLEANER","CONSUMABLES","MAINTENANCE","REINSTATEMENT","CAPITAL","OTHER",
  ]),
  amount: z.number().positive(),
  scope: z.enum(["UNIT","PROPERTY","PORTFOLIO"]),
  propertyId: z.string().optional().nullable(),
  unitId: z.string().optional().nullable(),
  frequency: z.enum(["MONTHLY","QUARTERLY","ANNUAL"]).default("MONTHLY"),
  nextDueDate: z.string(),
  vendorId: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

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
        { scope: "PORTFOLIO" },
      ],
    },
    include: {
      property: { select: { name: true } },
      unit: { select: { unitNumber: true } },
      vendor: { select: { id: true, name: true, category: true } },
    },
    orderBy: { nextDueDate: "asc" },
  });

  return Response.json(items);
}

export async function POST(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { nextDueDate, ...rest } = parsed.data;
  const item = await prisma.recurringExpense.create({
    data: { ...rest, nextDueDate: new Date(nextDueDate) },
    include: {
      property: { select: { name: true } },
      unit: { select: { unitNumber: true } },
      vendor: { select: { id: true, name: true, category: true } },
    },
  });

  return Response.json(item, { status: 201 });
}
