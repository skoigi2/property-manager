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
  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
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

  if (isSuperAdmin) {
    // Super-admin sees all users across all orgs
    whereClause = {};
  } else if (session!.user.role === "ADMIN") {
    // Org admin sees all users in their org
    whereClause = { organizationId: orgId };
  } else {
    // MANAGER sees users sharing at least one property within their org
    const managerAccess = await prisma.propertyAccess.findMany({
      where: { userId: session!.user.id },
      select: { propertyId: true },
    });
    const myPropertyIds = managerAccess.map((a) => a.propertyId);

    if (myPropertyIds.length === 0) {
      whereClause = { id: session!.user.id };
    } else {
      const sharedAccess = await prisma.propertyAccess.findMany({
        where: { propertyId: { in: myPropertyIds } },
        select: { userId: true },
      });
      const shared = new Set(sharedAccess.map((a) => a.userId));
      shared.add(session!.user.id);
      whereClause = { id: { in: Array.from(shared) } };
    }
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
      organization: { select: { id: true, name: true } },
      createdAt: true,
      propertyAccess: {
        include: { property: { select: { id: true, name: true } } },
      },
      ownedProperties: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });

  return Response.json(users);
}

export async function POST(req: Request) {
  const { session, error } = await requireManagerSession();
  if (error) return error;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { name, email, password, role, phone, propertyIds, organizationId: bodyOrgId } = parsed.data;

  // Only ADMIN can create other ADMIN users
  if (role === "ADMIN" && session!.user.role !== "ADMIN") {
    return Response.json({ error: "Only admins can create admin users" }, { status: 403 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return Response.json({ error: "Email already in use" }, { status: 409 });

  const hashed = await bcrypt.hash(password, 10);

  const isSuperAdmin = session!.user.role === "ADMIN" && session!.user.organizationId === null;
  // Super-admin can specify which org the user belongs to; otherwise inherit creator's org
  const newUserOrgId = isSuperAdmin
    ? (bodyOrgId ?? null)
    : session!.user.organizationId ?? null;

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      role,
      phone,
      organizationId: newUserOrgId,
      propertyAccess: propertyIds?.length
        ? { create: propertyIds.map((propertyId) => ({ propertyId })) }
        : undefined,
    },
    select: { id: true, name: true, email: true, role: true, phone: true, isActive: true, createdAt: true },
  });

  return Response.json(user, { status: 201 });
}
