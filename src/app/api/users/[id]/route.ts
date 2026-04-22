import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth-utils";
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

async function requireManagerSession() {
  const session = await auth();
  if (!session) return { session: null, error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  const effectiveRole = session.user.orgRole ?? session.user.role;
  if (effectiveRole !== "ADMIN" && effectiveRole !== "MANAGER" && effectiveRole !== "ACCOUNTANT") {
    return { session: null, error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, error: null };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerSession();
  if (error) return error;

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { role: true, organizationId: true },
  });
  const targetIsSuperAdmin = target?.role === "ADMIN" && target?.organizationId === null;
  const callerIsSuperAdmin =
    session!.user.role === "ADMIN" && session!.user.organizationId === null;

  // Only super-admin can modify a super-admin
  if (targetIsSuperAdmin && !callerIsSuperAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  // Only ADMIN (org-level) can modify another ADMIN user
  if (target?.role === "ADMIN" && session!.user.orgRole !== "ADMIN" && !callerIsSuperAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Org-admin can only edit users within their own organisation
  const callerIsOrgAdmin = session!.user.orgRole === "ADMIN" && !callerIsSuperAdmin;
  if (callerIsOrgAdmin && target?.organizationId !== session!.user.organizationId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
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

  return Response.json(user);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const effectiveRole = session.user.orgRole ?? session.user.role;
  if (effectiveRole !== "ADMIN" && effectiveRole !== "MANAGER") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  // Prevent self-deletion
  if (session.user.id === params.id) return Response.json({ error: "Cannot delete yourself" }, { status: 400 });

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { role: true, organizationId: true },
  });
  const targetIsSuperAdmin = target?.role === "ADMIN" && target?.organizationId === null;
  const callerIsSuperAdmin =
    session.user.role === "ADMIN" && session.user.organizationId === null;

  if (targetIsSuperAdmin && !callerIsSuperAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (target?.role === "ADMIN" && session.user.orgRole !== "ADMIN" && !callerIsSuperAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
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
  return new Response(null, { status: 204 });
}
