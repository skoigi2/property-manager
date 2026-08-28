import { prisma } from "@/lib/prisma";
import { requireAdmin, requireSuperAdmin } from "@/lib/auth-utils";
import { roleOutranksCaller } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import bcrypt from "bcryptjs";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(["ADMIN", "OWNER", "MANAGER", "ACCOUNTANT"]).optional(),
  organizationId: z.string().nullable().optional(),
});

const accessSchema = z.object({
  propertyId: z.string(),
  grant: z.boolean(), // true = grant, false = revoke
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  // User management is an ADMIN action — requireAdmin judges by the
  // MEMBERSHIP role for the active org (orgRole), never the global User.role
  // (which a founder of another org carries as ADMIN while being a mere
  // MANAGER here).
  const { session, error } = await requireAdmin();
  if (error) return error;

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { name: true, phone: true, isActive: true, role: true, organizationId: true },
  });
  if (!target) return Response.json({ error: "Not found" }, { status: 404 });
  const targetIsSuperAdmin = target.role === "ADMIN" && target.organizationId === null;
  const callerIsSuperAdmin =
    session!.user.role === "ADMIN" && session!.user.organizationId === null;

  // Only super-admin can modify a super-admin
  if (targetIsSuperAdmin && !callerIsSuperAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  // Only ADMIN (org-level) can modify another ADMIN user
  if (target.role === "ADMIN" && session!.user.orgRole !== "ADMIN" && !callerIsSuperAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Every non-super-admin caller may only touch users who are members of the
  // caller's ACTIVE org. The membership table is the source of truth —
  // User.organizationId is just the active-org cursor (mirrors GET /api/users).
  const callerOrgId = session!.user.organizationId;
  if (!callerIsSuperAdmin) {
    if (!callerOrgId) return Response.json({ error: "Forbidden" }, { status: 403 });
    const sharedMembership = await prisma.userOrganizationMembership.findUnique({
      where: { userId_organizationId: { userId: params.id, organizationId: callerOrgId } },
    });
    if (!sharedMembership) return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  // Handle property access grant/revoke
  if ("grant" in body) {
    const parsed = accessSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

    if (parsed.data.grant) {
      await prisma.propertyAccess.upsert({
        where: { userId_propertyId: { userId: params.id, propertyId: parsed.data.propertyId } },
        create: { userId: params.id, propertyId: parsed.data.propertyId },
        update: {},
      });
    } else {
      await prisma.propertyAccess.deleteMany({
        where: { userId: params.id, propertyId: parsed.data.propertyId },
      });
    }
    return Response.json({ ok: true });
  }

  // Handle user field updates
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  // Role escalation guard: cannot promote anyone above your own org role
  if (parsed.data.role && !callerIsSuperAdmin && roleOutranksCaller(parsed.data.role, session!.user.orgRole)) {
    return Response.json({ error: "You cannot assign a role higher than your own." }, { status: 403 });
  }

  // Only super-admin can reassign a user to a different org
  if (parsed.data.organizationId !== undefined) {
    const { error: saError } = await requireSuperAdmin();
    if (saError) return saError;
  }

  const { password, organizationId: newOrgId, role: newRole, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest };
  if (password) updateData.password = await bcrypt.hash(password, 10);
  if (newOrgId !== undefined) updateData.organizationId = newOrgId;
  if (newRole) updateData.role = newRole;

  const user = await prisma.user.update({
    where: { id: params.id },
    data: updateData,
    select: { id: true, name: true, email: true, role: true, phone: true, isActive: true, organizationId: true },
  });

  // Sync membership role when role changes
  if (newRole && user.organizationId) {
    await prisma.userOrganizationMembership.updateMany({
      where: { userId: params.id, organizationId: user.organizationId },
      data:  { role: newRole },
    });
  }

  // Sync membership table when org changes (super-admin only — guarded above)
  if (newOrgId !== undefined) {
    if (target?.organizationId && target.organizationId !== newOrgId) {
      await prisma.userOrganizationMembership.deleteMany({
        where: { userId: params.id, organizationId: target.organizationId },
      });
    }
    if (newOrgId) {
      await prisma.userOrganizationMembership.upsert({
        where:  { userId_organizationId: { userId: params.id, organizationId: newOrgId } },
        create: { userId: params.id, organizationId: newOrgId, role: user.role, isBillingOwner: false },
        update: {},
      });
    }
  }

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "User",
    resourceId: params.id,
    organizationId: callerOrgId,
    before: target,
    after: parsed.data, // logAudit redacts password keys
  });

  return Response.json(user);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  // Admin-only, judged by membership orgRole (see PATCH above)
  const { session: adminSession, error } = await requireAdmin();
  if (error) return error;
  const session = adminSession!;
  // Prevent self-deletion
  if (session.user.id === params.id) return Response.json({ error: "Cannot delete yourself" }, { status: 400 });

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { name: true, email: true, role: true, organizationId: true },
  });
  if (!target) return Response.json({ error: "Not found" }, { status: 404 });
  const targetIsSuperAdmin = target.role === "ADMIN" && target.organizationId === null;
  const callerIsSuperAdmin =
    session.user.role === "ADMIN" && session.user.organizationId === null;

  if (targetIsSuperAdmin && !callerIsSuperAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (target.role === "ADMIN" && session.user.orgRole !== "ADMIN" && !callerIsSuperAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Every non-super-admin caller may only delete members of their ACTIVE org
  // (membership table, not the target's active-org cursor).
  if (!callerIsSuperAdmin) {
    const callerOrgId = session.user.organizationId;
    if (!callerOrgId) return Response.json({ error: "Forbidden" }, { status: 403 });
    const sharedMembership = await prisma.userOrganizationMembership.findUnique({
      where: { userId_organizationId: { userId: params.id, organizationId: callerOrgId } },
    });
    if (!sharedMembership) return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Block deletion if user is the billing owner of any org
  const billingOwnerMembership = await prisma.userOrganizationMembership.findFirst({
    where: { userId: params.id, isBillingOwner: true },
    select: { organizationId: true },
  });
  if (billingOwnerMembership) {
    return Response.json(
      { error: "Cannot delete a billing owner. Transfer billing ownership first via Settings → Billing." },
      { status: 400 }
    );
  }

  await prisma.user.delete({ where: { id: params.id } });

  await logAudit({
    userId: session.user.id,
    userEmail: session.user.email,
    action: "DELETE",
    resource: "User",
    resourceId: params.id,
    organizationId: session.user.organizationId,
    before: target,
  });

  return new Response(null, { status: 204 });
}
