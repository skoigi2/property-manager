import { requireAuth, requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { tenantSchema } from "@/lib/validations";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAuth();
  if (error) return error;

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: {
      unit: {
        include: {
          property: { select: { name: true, type: true, manager: { select: { name: true, email: true } } } },
          // Include all income entries for the unit (tenantId filter applied in UI)
          incomeEntries: {
            select: {
              id: true, date: true, type: true, grossAmount: true,
              agentCommission: true, note: true, tenantId: true,
            },
            orderBy: { date: "asc" },
          },
        },
      },
    },
  });

  if (!tenant) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(tenant);
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const body = await req.json();
  const parsed = tenantSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { leaseStart, leaseEnd, ...rest } = parsed.data;

  const tenant = await prisma.tenant.update({
    where: { id: params.id },
    data: {
      ...rest,
      leaseStart: new Date(leaseStart),
      leaseEnd: leaseEnd ? new Date(leaseEnd) : null,
    },
    include: {
      unit: { include: { property: { select: { name: true, type: true } } } },
    },
  });

  return Response.json(tenant);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  await prisma.tenant.update({
    where: { id: params.id },
    data: { isActive: false },
  });

  return Response.json({ success: true });
}
