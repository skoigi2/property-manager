import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  tenantId: z.string(),
  propertyId: z.string(),
  amountOwed: z.number().positive(),
  notes: z.string().optional(),
});

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const cases = await prisma.arrearsCase.findMany({
    where: { propertyId: { in: propertyIds } },
    include: {
      tenant: { select: { id: true, name: true, phone: true, email: true, unit: { select: { unitNumber: true } } } },
      property: { select: { name: true } },
      escalations: { orderBy: { createdAt: "desc" } },
    },
    orderBy: [{ stage: "asc" }, { updatedAt: "desc" }],
  });

  return Response.json(cases);
}

export async function POST(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  // Prevent duplicate open cases for same tenant
  const existing = await prisma.arrearsCase.findFirst({
    where: { tenantId: parsed.data.tenantId, stage: { not: "RESOLVED" } },
  });
  if (existing) return Response.json({ error: "An open arrears case already exists for this tenant." }, { status: 409 });

  const arrearsCase = await prisma.arrearsCase.create({
    data: {
      ...parsed.data,
      escalations: {
        create: { stage: "INFORMAL_REMINDER", notes: parsed.data.notes ?? null },
      },
    },
    include: {
      tenant: { select: { id: true, name: true, phone: true, email: true, unit: { select: { unitNumber: true } } } },
      property: { select: { name: true } },
      escalations: { orderBy: { createdAt: "desc" } },
    },
  });

  return Response.json(arrearsCase, { status: 201 });
}
