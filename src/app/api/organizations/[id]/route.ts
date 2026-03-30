import { requireAuth, requireSuperAdmin, getCurrentOrgId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

async function canAccessOrg(orgId: string, session: { user: { role: string; organizationId: string | null } }) {
  const isSuperAdmin = session.user.role === "ADMIN" && session.user.organizationId === null;
  if (isSuperAdmin) return true;
  return session.user.organizationId === orgId;
}

// ── GET /api/organizations/[id] ───────────────────────────────────────────────
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { error, session } = await requireAuth();
  if (error) return error;

  if (!canAccessOrg(params.id, session!)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const org = await prisma.organization.findUnique({
    where: { id: params.id },
    include: { _count: { select: { users: true, properties: true } } },
  });
  if (!org) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(org);
}

// ── PATCH /api/organizations/[id] ────────────────────────────────────────────
const updateSchema = z.object({
  name:     z.string().min(1).optional(),
  address:  z.string().optional().nullable(),
  phone:    z.string().optional().nullable(),
  email:    z.string().email().optional().nullable(),
  website:  z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { error, session } = await requireAuth();
  if (error) return error;

  // Only org admin or super-admin may update
  const isSuperAdmin = session!.user.role === "ADMIN" && session!.user.organizationId === null;
  const isOrgAdmin   = session!.user.role === "ADMIN" && session!.user.organizationId === params.id;
  if (!isSuperAdmin && !isOrgAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const org = await prisma.organization.update({
    where: { id: params.id },
    data: parsed.data,
  });
  return Response.json(org);
}
