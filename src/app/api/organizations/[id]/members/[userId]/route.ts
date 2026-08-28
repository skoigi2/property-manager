import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { roleOutranksCaller } from "@/lib/permissions";
import { z } from "zod";

const roleSchema = z.object({
  role: z.enum(["ADMIN", "MANAGER", "ACCOUNTANT", "OWNER"]),
});

/**
 * PATCH /api/organizations/[id]/members/[userId]
 *
 * Changes a member's role WITHIN this organisation (the membership role —
 * global User.role is never touched; it exists only for super-admin
 * detection).
 *
 * Access: super-admin OR org-admin (same org only, cannot assign above own
 * role, cannot demote the org's last admin).
 */
export async function PATCH(
  req: Request,
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

  const parsed = roleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const newRole = parsed.data.role;

  if (!isSuperAdmin && roleOutranksCaller(newRole, session!.user.orgRole)) {
    return Response.json({ error: "You cannot assign a role higher than your own." }, { status: 403 });
  }

  const membership = await prisma.userOrganizationMembership.findUnique({
    where: { userId_organizationId: { userId: params.userId, organizationId: params.id } },
  });
  if (!membership) {
    return Response.json({ error: "Not a member" }, { status: 404 });
  }
  if (membership.role === newRole) {
    return Response.json({ ok: true, role: newRole });
  }

  // Don't let an org-admin demote the org's last remaining ADMIN — the org
  // would become unmanageable from inside. Super-admin may still do it.
  if (!isSuperAdmin && membership.role === "ADMIN" && newRole !== "ADMIN") {
    const adminCount = await prisma.userOrganizationMembership.count({
      where: { organizationId: params.id, role: "ADMIN" },
    });
    if (adminCount <= 1) {
      return Response.json(
        { error: "This is the organisation's only admin — promote someone else to admin first." },
        { status: 400 }
      );
    }
  }

  await prisma.userOrganizationMembership.update({
    where: { userId_organizationId: { userId: params.userId, organizationId: params.id } },
    data:  { role: newRole },
  });

  await logAudit({
    userId:    session!.user.id,
    userEmail: session!.user.email ?? null,
    action:    "UPDATE",
    resource:  "OrgMembership",
    resourceId: `${params.id}:${params.userId}`,
    organizationId: params.id,
    before: { role: membership.role },
    after:  { role: newRole },
  });

  return Response.json({ ok: true, role: newRole });
}

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
