import { requireAuth, requireSuperAdmin, getCurrentOrgId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  name:    z.string().min(1),
  address: z.string().optional(),
  phone:   z.string().optional(),
  email:   z.string().email().optional(),
  website: z.string().optional(),
});

// ── GET /api/organizations ────────────────────────────────────────────────────
// Super-admin: all orgs. Org member: their own org only.
export async function GET() {
  const { error, session } = await requireAuth();
  if (error) return error;

  const isSuperAdmin = session!.user.role === "ADMIN" && session!.user.organizationId === null;

  const include = {
    _count: { select: { memberships: true, properties: true } },
    properties: {
      select: {
        id: true,
        name: true,
        type: true,
        owner: { select: { id: true, name: true, email: true, role: true, isActive: true } },
        propertyAccess: {
          select: {
            user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
          },
        },
      },
      orderBy: { name: "asc" as const },
    },
    memberships: {
      select: {
        user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
      },
      orderBy: { user: { name: "asc" as const } },
    },
  };

  if (isSuperAdmin) {
    const orgs = await prisma.organization.findMany({
      include,
      orderBy: { name: "asc" },
    });
    return Response.json(orgs);
  }

  // Org member — return only their org
  // Primary: use organizationId from JWT; fallback: look up via membership table
  let orgId = await getCurrentOrgId();
  if (!orgId) {
    const membership = await prisma.userOrganizationMembership.findFirst({
      where: { userId: session!.user.id },
      orderBy: { createdAt: "asc" },
    });
    orgId = membership?.organizationId ?? null;
  }
  if (!orgId) return Response.json({ error: "No organization" }, { status: 404 });

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include,
  });
  return Response.json(org ? [org] : []);
}

// ── POST /api/organizations ───────────────────────────────────────────────────
// Super-admin only. Optionally creates the first admin user for the org.
const createWithAdminSchema = z.object({
  name:      z.string().min(1),
  address:   z.string().optional(),
  phone:     z.string().optional(),
  email:     z.string().email().optional(),
  website:   z.string().optional(),
  adminName:  z.string().optional(),
  adminEmail: z.string().email().optional(),
  adminPassword: z.string().min(6).optional(),
});

export async function POST(req: Request) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const body = await req.json();
  const parsed = createWithAdminSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { name, address, phone, email, website, adminName, adminEmail, adminPassword } = parsed.data;

  const org = await prisma.organization.create({
    data: { name, address, phone, email, website },
  });

  // Optionally create the org's first ADMIN user
  if (adminEmail && adminPassword) {
    const bcrypt = (await import("bcryptjs")).default;
    const hashed = await bcrypt.hash(adminPassword, 10);
    const newUser = await prisma.user.create({
      data: {
        name:           adminName ?? adminEmail,
        email:          adminEmail,
        password:       hashed,
        role:           "ADMIN",
        organizationId: org.id,
      },
    });
    await prisma.userOrganizationMembership.create({
      data: { userId: newUser.id, organizationId: org.id },
    });
  }

  return Response.json(org, { status: 201 });
}
