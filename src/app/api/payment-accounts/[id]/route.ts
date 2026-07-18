import { requireManager, requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { paymentAccountSchema } from "@/lib/payment-accounts";

const ACCOUNT_COUNTS = { _count: { select: { agreements: true, units: true } } } as const;

async function loadOwnedAccount(id: string, orgId: string | null | undefined) {
  if (!orgId) return null;
  const account = await prisma.paymentAccount.findUnique({ where: { id }, include: ACCOUNT_COUNTS });
  if (!account || account.organizationId !== orgId) return null;
  return account;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const account = await loadOwnedAccount(params.id, session!.user.organizationId);
  if (!account) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(account);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const account = await loadOwnedAccount(params.id, session!.user.organizationId);
  if (!account) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = paymentAccountSchema.partial().safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.paymentAccount.update({
    where: { id: params.id },
    data: parsed.data,
    include: ACCOUNT_COUNTS,
  });

  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const account = await loadOwnedAccount(params.id, session!.user.organizationId);
  if (!account) return Response.json({ error: "Not found" }, { status: 404 });

  const linkedCount = account._count.agreements + account._count.units;
  if (linkedCount > 0) {
    // Mirror the Vendors convention: refuse to delete while linked so
    // invoices don't silently lose their payment details — deactivate instead.
    return Response.json(
      {
        error: `This account is used by ${linkedCount} propert${linkedCount === 1 ? "y/unit" : "ies/units"}. Deactivate it instead, or reassign them first.`,
        linkedCount,
      },
      { status: 409 },
    );
  }

  await prisma.paymentAccount.delete({ where: { id: params.id } });
  return Response.json({ success: true });
}
