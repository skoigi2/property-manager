import { prisma } from "@/lib/prisma";

/** A unit's payment-account override must belong to the unit's property's
 *  organisation (mirrors PATCH /api/units/[id]). Returns a Response on error. */
export async function checkUnitPaymentAccount(unitId: string, paymentAccountId: string | null | undefined): Promise<Response | null> {
  if (!paymentAccountId) return null;
  const [account, unit] = await Promise.all([
    prisma.paymentAccount.findUnique({ where: { id: paymentAccountId }, select: { organizationId: true } }),
    prisma.unit.findUnique({ where: { id: unitId }, select: { property: { select: { organizationId: true } } } }),
  ]);
  if (!account || !unit || account.organizationId !== unit.property.organizationId) {
    return Response.json({ error: "Payment account not found" }, { status: 400 });
  }
  return null;
}

