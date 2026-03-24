import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["AIRBNB", "LONGTERM"]),
  category: z.enum(["RESIDENTIAL", "OFFICE", "INDUSTRIAL", "RETAIL", "MIXED_USE", "OTHER"]).optional(),
  categoryOther: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  description: z.string().optional(),
  ownerId: z.string().optional(),
  managementFeeRate: z.number().optional(),
  managementFeeFlat: z.number().optional(),
  serviceChargeDefault: z.number().optional(),
});

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const ids = await getAccessiblePropertyIds();
  if (ids === null) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const properties = await prisma.property.findMany({
    where: { id: { in: ids } },
    include: {
      units: { select: { id: true, unitNumber: true, type: true, status: true, monthlyRent: true } },
      owner: { select: { id: true, name: true, email: true } },
      _count: { select: { units: true } },
    },
    orderBy: { name: "asc" },
  });

  return Response.json(properties);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const property = await prisma.property.create({ data: parsed.data });

  // Automatically grant the creating manager access
  await prisma.propertyAccess.create({
    data: { userId: session.user.id, propertyId: property.id },
  });

  return Response.json(property, { status: 201 });
}
