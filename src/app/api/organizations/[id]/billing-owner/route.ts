import { requireBillingOwner } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const transferSchema = z.object({
  newOwnerId: z.string().min(1),
});

/**
 * POST /api/organizations/[id]/billing-owner
 *
 * Transfers billing ownership to another ADMIN member of the org.
 * Only the current billing owner (or platform super-admin) may do this.
 *
 * Uses sequential awaits — pgBouncer (transaction pooling) is incompatible
 * with the callback-form of prisma.$transaction.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { error, session } = await requireBillingOwner();
  if (error) return error;

  const body = await req.json();
  const parsed = transferSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { newOwnerId } = parsed.data;
  const orgId = params.id;

  // Super-admin can transfer any org's ownership; non-super-admin can only transfer their own org
  const isSuperAdmin = session!.user.role === "ADMIN" && !session!.user.organizationId;
  if (!isSuperAdmin && session!.user.organizationId !== orgId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify new owner is an ADMIN member of this org
  const newOwnerMembership = await prisma.userOrganizationMembership.findUnique({
    where: { userId_organizationId: { userId: newOwnerId, organizationId: orgId } },
    select: { role: true, isBillingOwner: true },
  });

  if (!newOwnerMembership) {
    return Response.json({ error: "User is not a member of this organisation." }, { status: 404 });
  }
  if (newOwnerMembership.isBillingOwner) {
    return Response.json({ error: "This user is already the billing owner." }, { status: 409 });
  }

  // Find the current billing owner
  const currentOwner = await prisma.userOrganizationMembership.findFirst({
    where: { organizationId: orgId, isBillingOwner: true },
    select: { userId: true },
  });

  // Remove billing owner from current owner (if one exists and is not the new owner)
  if (currentOwner && currentOwner.userId !== newOwnerId) {
    await prisma.userOrganizationMembership.update({
      where: { userId_organizationId: { userId: currentOwner.userId, organizationId: orgId } },
      data: { isBillingOwner: false },
    });
  }

  // Assign billing owner and ensure they are ADMIN (promote if needed)
  await prisma.userOrganizationMembership.update({
    where: { userId_organizationId: { userId: newOwnerId, organizationId: orgId } },
    data: { isBillingOwner: true, role: "ADMIN" },
  });

  // Sync global User.role to ADMIN so their JWT reflects the promotion
  await prisma.user.update({
    where: { id: newOwnerId },
    data: { role: "ADMIN" },
  });

  return Response.json({ ok: true });
}
