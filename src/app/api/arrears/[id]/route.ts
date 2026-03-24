import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const STAGE_ORDER = ["INFORMAL_REMINDER","DEMAND_LETTER","LEGAL_NOTICE","EVICTION","RESOLVED"] as const;
type Stage = typeof STAGE_ORDER[number];

const patchSchema = z.object({
  stage: z.enum(STAGE_ORDER).optional(),
  amountOwed: z.number().positive().optional(),
  notes: z.string().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const arrearsCase = await prisma.arrearsCase.findUnique({ where: { id: params.id } });
  if (!arrearsCase) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(arrearsCase.propertyId)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { stage, notes, ...rest } = parsed.data;

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.arrearsCase.update({
      where: { id: params.id },
      data: {
        ...rest,
        ...(stage ? { stage } : {}),
        ...(stage === "RESOLVED" ? { resolvedAt: new Date() } : {}),
      },
      include: {
        tenant: { select: { id: true, name: true, phone: true, email: true, unit: { select: { unitNumber: true } } } },
        property: { select: { name: true } },
        escalations: { orderBy: { createdAt: "desc" } },
      },
    });

    if (stage && stage !== arrearsCase.stage) {
      await tx.arrearsEscalation.create({
        data: { caseId: params.id, stage: stage as Stage, notes: notes ?? null },
      });
    }

    return u;
  });

  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const arrearsCase = await prisma.arrearsCase.findUnique({ where: { id: params.id } });
  if (!arrearsCase) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(arrearsCase.propertyId)) return Response.json({ error: "Forbidden" }, { status: 403 });

  await prisma.arrearsCase.delete({ where: { id: params.id } });
  return Response.json({ success: true });
}
