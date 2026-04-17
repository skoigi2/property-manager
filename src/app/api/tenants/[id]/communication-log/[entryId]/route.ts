import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  followUpCompleted: z.boolean().optional(),
  followUpDate:      z.string().nullable().optional(),
  body:              z.string().max(5000).optional(),
});

async function resolveEntry(entryId: string, accessibleIds: string[]) {
  const entry = await prisma.communicationLog.findUnique({
    where: { id: entryId },
    include: { tenant: { include: { unit: true } } },
  });
  if (!entry || !accessibleIds.includes(entry.tenant.unit.propertyId)) return null;
  return entry;
}

// ── PATCH /api/tenants/[id]/communication-log/[entryId] ──────────────────────
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; entryId: string } },
) {
  const { error } = await requireAuth();
  if (error) return error;

  const accessibleIds = await getAccessiblePropertyIds();
  if (!accessibleIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const entry = await resolveEntry(params.entryId, accessibleIds);
  if (!entry) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { followUpCompleted, followUpDate, body: bodyText } = parsed.data;

  const updated = await prisma.communicationLog.update({
    where: { id: params.entryId },
    data: {
      ...(followUpCompleted !== undefined && { followUpCompleted }),
      ...(followUpDate !== undefined && { followUpDate: followUpDate ? new Date(followUpDate) : null }),
      ...(bodyText !== undefined && { body: bodyText }),
    },
  });

  return Response.json(updated);
}

// ── DELETE /api/tenants/[id]/communication-log/[entryId] ─────────────────────
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; entryId: string } },
) {
  const { error } = await requireAuth();
  if (error) return error;

  const accessibleIds = await getAccessiblePropertyIds();
  if (!accessibleIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const entry = await resolveEntry(params.entryId, accessibleIds);
  if (!entry) return Response.json({ error: "Not found" }, { status: 404 });

  await prisma.communicationLog.delete({ where: { id: params.entryId } });
  return new Response(null, { status: 204 });
}
