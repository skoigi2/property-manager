import { requireManager, requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { paymentAccountSchema } from "@/lib/payment-accounts";

const ACCOUNT_COUNTS = { _count: { select: { agreements: true, units: true } } } as const;

export async function GET(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;

  const orgId = session!.user.organizationId;
  if (!orgId) return Response.json([]);

  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("includeInactive") === "true";

  const accounts = await prisma.paymentAccount.findMany({
    where: { organizationId: orgId, ...(includeInactive ? {} : { isActive: true }) },
    include: ACCOUNT_COUNTS,
    orderBy: { name: "asc" },
  });

  return Response.json(accounts);
}

export async function POST(req: Request) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const orgId = session!.user.organizationId;
  if (!orgId) {
    return Response.json({ error: "Payment accounts belong to an organisation" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = paymentAccountSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const account = await prisma.paymentAccount.create({
    data: { ...parsed.data, organizationId: orgId },
    include: ACCOUNT_COUNTS,
  });

  return Response.json(account, { status: 201 });
}
