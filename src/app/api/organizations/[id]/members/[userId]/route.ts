import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

/**
 * DELETE /api/organizations/[id]/members/[userId]
 *
 * Removes a user from an organisation's membership.
 * - Deletes the UserOrganizationMembership record.
 * - If the user's active org (User.organizationId) was this org,
 *   switches them to another membership or sets it to null.
 *
 * Access: super-admin OR org-admin (same org only).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; userId: string } }
) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const isSuperAdmin =
    session!.user.role === "ADMIN" && session!.user.organizationId === null;
  const isOrgAdmin =
    session!.user.orgRole === "ADMIN" &&
    session!.user.organizationId === params.id;

  if (!isSuperAdmin && !isOrgAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify membership exists
  const membership = await prisma.userOrganizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: params.userId,
        organizationId: params.id,
      },
    },
  });
  if (!membership) {
    return Response.json({ error: "Not a member" }, { status: 404 });
  }

  // Block removal of the billing owner — must transfer first
  if (membership.isBillingOwner) {
    return Response.json(
      { error: "Cannot remove the billing owner. Transfer billing ownership first via Settings → Billing." },
      { status: 400 }
    );
  }

  // Remove membership
  await prisma.userOrganizationMembership.delete({
    where: {
      userId_organizationId: {
        userId: params.userId,
        organizationId: params.id,
      },
    },
  });

  // If user's active org was this org, switch to another or clear it
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { organizationId: true },
  });

  if (user?.organizationId === params.id) {
    const otherMembership = await prisma.userOrganizationMembership.findFirst({
      where: { userId: params.userId },
      select: { organizationId: true },
    });
    await prisma.user.update({
      where: { id: params.userId },
      data: { organizationId: otherMembership?.organizationId ?? null },
    });
  }

  await logAudit({
    userId:    session!.user.id,
    userEmail: session!.user.email ?? null,
    action:    "DELETE",
    resource:  "OrgMembership",
    resourceId: `${params.id}:${params.userId}`,
    organizationId: params.id,
    before: { role: membership.role, isBillingOwner: membership.isBillingOwner },
  });

  return new Response(null, { status: 204 });
}
