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
  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
    return { session: null, error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, error: null };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerSession();
  if (error) return error;

  // Fetch target to check if they are a super-admin
  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { role: true, organizationId: true },
  });
  const targetIsSuperAdmin = target?.role === "ADMIN" && target?.organizationId === null;
  const callerIsSuperAdmin =
    session!.user.role === "ADMIN" && (session!.user as any).organizationId === null;

  // Only super-admin can modify a super-admin
  if (targetIsSuperAdmin && !callerIsSuperAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  // Only ADMIN can modify another ADMIN user
  if (target?.role === "ADMIN" && session!.user.role !== "ADMIN") {
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

  const { password, organizationId: newOrgId, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest };
  if (password) {
    updateData.password = await bcrypt.hash(password, 10);
  }
  if (newOrgId !== undefined) {
    updateData.organizationId = newOrgId;
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data: updateData,
    select: { id: true, name: true, email: true, role: true, phone: true, isActive: true },
  });

  // Sync membership table when org changes
  if (newOrgId) {
    await prisma.userOrganizationMembership.upsert({
      where: { userId_organizationId: { userId: params.id, organizationId: newOrgId } },
      create: { userId: params.id, organizationId: newOrgId },
      update: {},
    });
  }

  return Response.json(user);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  // Prevent self-deletion
  if (session.user.id === params.id) return Response.json({ error: "Cannot delete yourself" }, { status: 400 });

  // Only ADMIN can delete another ADMIN; only super-admin can delete a super-admin
  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { role: true, organizationId: true },
  });
  const targetIsSuperAdmin = target?.role === "ADMIN" && target?.organizationId === null;
  const callerIsSuperAdmin =
    session.user.role === "ADMIN" && (session.user as any).organizationId === null;

  if (targetIsSuperAdmin && !callerIsSuperAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (target?.role === "ADMIN" && session.user.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.user.delete({ where: { id: params.id } });
  return new Response(null, { status: 204 });
}
