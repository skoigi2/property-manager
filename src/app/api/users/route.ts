import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "OWNER", "MANAGER", "ACCOUNTANT"]),
  phone: z.string().optional(),
  propertyIds: z.array(z.string()).optional(),
  organizationId: z.string().optional().nullable(),
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

export async function GET() {
  const { session, error } = await requireManagerSession();
  if (error) return error;

  const isSuperAdmin = session!.user.role === "ADMIN" && session!.user.organizationId === null;
  const orgId = session!.user.organizationId;

  let whereClause: Record<string, unknown> = {};

  // Never expose super-admin accounts to non-super-admins
  const excludeSuperAdmins = { NOT: { role: "ADMIN", organizationId: null } };

  if (isSuperAdmin) {
    // Super-admin sees all users across all orgs
    whereClause = {};
  } else if (session!.user.orgRole === "ADMIN") {
    // Org admin sees all members of their org via the membership table
    // (User.organizationId is the active-org cursor; membership is the source of truth)
    whereClause = {
      organizationMemberships: { some: { organizationId: orgId } },
      ...excludeSuperAdmins,
    };
  } else {
    // MANAGER / ACCOUNTANT — all members of their org (same as org-admin scope)
    whereClause = {
      organizationMemberships: { some: { organizationId: orgId } },
      ...excludeSuperAdmins,
    };
  }

  const users = await prisma.user.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      isActive: true,
      organizationId: true,
      organization: {
        select: {
          id: true,
          name: true,
          pricingTier: true,
          subscriptionStatus: true,
          trialEndsAt: true,
          freeAccess: true,
        },
      },
      createdAt: true,
      propertyAccess: {
        include: { property: { select: { id: true, name: true } } },
      },
      ownedProperties: { select: { id: true, name: true } },
      organizationMemberships: {
        select: { organizationId: true, role: true, isBillingOwner: true },
      },
    },
    orderBy: { name: "asc" },
  });

  // Attach orgRole: the membership role for the viewer's active org (or global role as fallback)
  const viewerOrgId = orgId;
  const usersWithOrgRole = users.map((u) => {
    const membership = viewerOrgId
      ? u.organizationMemberships.find((m) => m.organizationId === viewerOrgId)
      : null;
    return {
      ...u,
      orgRole: membership?.role ?? u.role,
      isBillingOwner: membership?.isBillingOwner ?? false,
    };
  });

  return Response.json(usersWithOrgRole);
}

export async function POST(req: Request) {
  const { session, error } = await requireManagerSession();
  if (error) return error;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { name, email, password, role, phone, propertyIds, organizationId: bodyOrgId } = parsed.data;

  const isSuperAdmin = session!.user.role === "ADMIN" && session!.user.organizationId === null;

  // Only ADMIN (org-admin or super-admin) can create ADMIN users; MANAGERs cannot
  if (role === "ADMIN" && session!.user.orgRole !== "ADMIN" && !isSuperAdmin) {
    return Response.json({ error: "Only admin users can create admin users" }, { status: 403 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return Response.json({ error: "Email already in use" }, { status: 409 });

  // Super-admin can specify which org the user belongs to; otherwise inherit creator's org
  const newUserOrgId = isSuperAdmin
    ? (bodyOrgId ?? null)
    : session!.user.organizationId ?? null;

  // Validate & look up granted properties before writing anything
  let grantedProperties: { id: string; organizationId: string | null }[] = [];
  if (propertyIds?.length) {
    grantedProperties = await prisma.property.findMany({
      where: { id: { in: propertyIds } },
      select: { id: true, organizationId: true },
    });

    // Non-super-admins cannot grant access to properties outside their org
    if (!isSuperAdmin && newUserOrgId) {
      const crossOrg = grantedProperties.some(
        (p) => p.organizationId && p.organizationId !== newUserOrgId
      );
      if (crossOrg) {
        return Response.json({ error: "One or more properties do not belong to your organisation" }, { status: 403 });
      }
    }
  }

  const hashed = await bcrypt.hash(password, 10);

  // For MANAGER / ACCOUNTANT users created without explicit propertyIds, grant
  // access to all properties in their org. Mirrors the invitation-accept flow
  // and prevents new managers from landing on an empty Properties page.
  // ADMIN sees all org properties via getAccessiblePropertyIds; OWNER is scoped
  // to ownedProperties — neither needs PropertyAccess rows.
  let effectivePropertyIds = propertyIds ?? [];
  if (
    !effectivePropertyIds.length &&
    (role === "MANAGER" || role === "ACCOUNTANT") &&
    newUserOrgId
  ) {
    const orgProps = await prisma.property.findMany({
      where:  { organizationId: newUserOrgId },
      select: { id: true },
    });
    effectivePropertyIds = orgProps.map((p) => p.id);
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      role,
      phone,
      organizationId: newUserOrgId,
      propertyAccess: effectivePropertyIds.length
        ? { create: effectivePropertyIds.map((propertyId) => ({ propertyId })) }
        : undefined,
    },
    select: { id: true, name: true, email: true, role: true, phone: true, isActive: true, createdAt: true },
  });

  // Upsert org membership for the user's primary org (include per-org role; never billing owner)
  if (newUserOrgId) {
    await prisma.userOrganizationMembership.upsert({
      where:  { userId_organizationId: { userId: user.id, organizationId: newUserOrgId } },
      create: { userId: user.id, organizationId: newUserOrgId, role, isBillingOwner: false },
      update: { role },
    });
  }

  // Also upsert memberships for any additional orgs introduced via property access
  const extraOrgIds = Array.from(
    new Set(
      grantedProperties
        .map((p) => p.organizationId)
        .filter((id): id is string => !!id && id !== newUserOrgId)
    )
  );
  for (const orgId of extraOrgIds) {
    await prisma.userOrganizationMembership.upsert({
      where:  { userId_organizationId: { userId: user.id, organizationId: orgId } },
      create: { userId: user.id, organizationId: orgId, role, isBillingOwner: false },
      update: {},
    });
  }

  return Response.json(user, { status: 201 });
}
