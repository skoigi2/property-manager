import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermissionWrite, requirePropertyAccess } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";

/** DELETE /api/payouts/[id] — remove a mis-recorded remittance. */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { error, session } = await requirePermissionWrite("FINANCIAL_DELETE");
  if (error) return error;

  const payout = await prisma.ownerPayout.findUnique({ where: { id: params.id } });
  if (!payout) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await requirePropertyAccess(payout.propertyId);
  if (!access.ok) return access.error!;

  await prisma.ownerPayout.delete({ where: { id: params.id } });

  await logAudit({
    userId:     session!.user.id,
    userEmail:  session!.user.email ?? "unknown",
    action:     "DELETE",
    resource:   "OwnerPayout",
    resourceId: payout.id,
    before:     payout,
  });

  return new NextResponse(null, { status: 204 });
}
