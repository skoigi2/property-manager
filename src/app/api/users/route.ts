import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["OWNER", "MANAGER", "ACCOUNTANT"]),
  phone: z.string().optional(),
  propertyIds: z.array(z.string()).optional(), // initial property access grants
});

/** Only MANAGER may list/create users */
async function requireManagerSession() {
  const session = await auth();
  if (!session) return { session: null, error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "MANAGER") return { session: null, error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  return { session, error: null };
}

export async function GET() {
  const { error } = await requireManagerSession();
  if (error) return error;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      isActive: true,
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
  const { error } = await requireManagerSession();
  if (error) return error;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { name, email, password, role, phone, propertyIds } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return Response.json({ error: "Email already in use" }, { status: 409 });

  const hashed = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      role,
      phone,
      propertyAccess: propertyIds?.length
        ? { create: propertyIds.map((propertyId) => ({ propertyId })) }
        : undefined,
    },
    select: { id: true, name: true, email: true, role: true, phone: true, isActive: true, createdAt: true },
  });

  return Response.json(user, { status: 201 });
}
