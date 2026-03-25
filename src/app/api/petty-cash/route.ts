import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { pettyCashSchema } from "@/lib/validations";
import { calcPettyCashBalance } from "@/lib/calculations";
import { logAudit } from "@/lib/audit";

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const propertyIdParam = searchParams.get("propertyId");
  const effectiveIds =
    propertyIdParam && propertyIds.includes(propertyIdParam)
      ? [propertyIdParam]
      : propertyIds;

  const entries = await prisma.pettyCash.findMany({
    where: {
      OR: [
        { propertyId: { in: effectiveIds } },
        { propertyId: null },
      ],
    },
    orderBy: { date: "asc" },
  });
  const withBalance = calcPettyCashBalance(entries);

  return Response.json(withBalance.reverse()); // newest first for display
}

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = pettyCashSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { date, propertyId, ...rest } = parsed.data;

  if (propertyId && !propertyIds.includes(propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const entry = await prisma.pettyCash.create({
    data: { ...rest, date: new Date(date), propertyId: propertyId ?? null },
  });

  await logAudit({ userId: session!.user.id, userEmail: session!.user.email, action: "CREATE", resource: "PettyCash", resourceId: entry.id, after: { type: entry.type, amount: entry.amount, date: entry.date } });

  return Response.json(entry, { status: 201 });
}
