import { requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  description: z.string().optional(),
  ownerId: z.string().nullable().optional(),
  managementFeeRate: z.number().nullable().optional(),
  managementFeeFlat: z.number().nullable().optional(),
  serviceChargeDefault: z.number().nullable().optional(),
});

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const access = await requirePropertyAccess(params.id);
  if (!access.ok) return access.error!;

  const property = await prisma.property.findUnique({
    where: { id: params.id },
    include: {
      units: { orderBy: { unitNumber: "asc" } },
      owner: { select: { id: true, name: true, email: true } },
      propertyAccess: {
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      },
    },
  });

  if (!property) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(property);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const access = await requirePropertyAccess(params.id);
  if (!access.ok) return access.error!;

  if (session.user.role !== "MANAGER") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const property = await prisma.property.update({
    where: { id: params.id },
    data: parsed.data,
  });

  return Response.json(property);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "MANAGER") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const access = await requirePropertyAccess(params.id);
  if (!access.ok) return access.error!;

  await prisma.property.delete({ where: { id: params.id } });
  return new Response(null, { status: 204 });
}
