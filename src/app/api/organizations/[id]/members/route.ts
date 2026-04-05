import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const addSchema = z.object({
  userId:      z.string().min(1),
  propertyIds: z.array(z.string()).optional(),
});

async function canManageMembers(
  orgId: string,
  session: { user: { id: string; role: string; organizationId: string | null } }
) {
  const isSuperAdmin = session.user.role === "ADMIN" && session.user.organizationId === null;
  const isOrgAdmin   = session.user.role === "ADMIN" && session.user.organizationId === orgId;
  return isSuperAdmin || isOrgAdmin;
}

// ── POST /api/organizations/[id]/members ─────────────────────────────────────
// Add an existing user to an org (upserts membership, optionally grants property access)
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { error, session } = await requireAuth();
  if (error) return error;

  if (!(await canManageMembers(params.id, session!))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { userId, propertyIds } = parsed.data;

  // Verify org exists
  const org = await prisma.organization.findUnique({ where: { id: params.id } });
  if (!org) return Response.json({ error: "Organisation not found" }, { status: 404 });

  // Verify user exists
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  // Validate property IDs belong to this org
  if (propertyIds?.length) {
    const props = await prisma.property.findMany({
      where: { id: { in: propertyIds } },
      select: { id: true, organizationId: true },
    });
    const crossOrg = props.some((p) => p.organizationId !== params.id);
    if (crossOrg) {
      return Response.json({ error: "One or more properties do not belong to this organisation" }, { status: 403 });
    }
  }

  // Upsert membership
  await prisma.userOrganizationMembership.upsert({
    where: { userId_organizationId: { userId, organizationId: params.id } },
    create: { userId, organizationId: params.id },
    update: {},
  });

  // If user has no active org yet, set this one
  if (!user.organizationId) {
    await prisma.user.update({
      where: { id: userId },
      data: { organizationId: params.id },
    });
  }

  // Grant property access
  if (propertyIds?.length) {
    for (const propertyId of propertyIds) {
      await prisma.propertyAccess.upsert({
        where: { userId_propertyId: { userId, propertyId } },
        create: { userId, propertyId },
        update: {},
      });
    }
  }

  return Response.json({ ok: true }, { status: 201 });
}
