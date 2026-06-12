import { requireAdminWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

async function loadOwned(id: string, orgId: string | null | undefined) {
  const ep = await prisma.webhookEndpoint.findUnique({ where: { id } });
  if (!ep || (orgId && ep.organizationId !== orgId)) return null;
  return ep;
}

const patchSchema = z.object({ isActive: z.boolean() });

/** PATCH /api/webhook-endpoints/[id] — enable/disable. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireAdminWrite();
  if (error) return error;

  const ep = await loadOwned(params.id, session!.user.organizationId);
  if (!ep) return Response.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await prisma.webhookEndpoint.update({
    where: { id: ep.id },
    data: { isActive: parsed.data.isActive, ...(parsed.data.isActive ? { failureCount: 0 } : {}) },
    select: { id: true, isActive: true },
  });
  return Response.json(updated);
}

/** DELETE /api/webhook-endpoints/[id] */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireAdminWrite();
  if (error) return error;

  const ep = await loadOwned(params.id, session!.user.organizationId);
  if (!ep) return Response.json({ error: "Not found" }, { status: 404 });

  await prisma.webhookEndpoint.delete({ where: { id: ep.id } });
  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email ?? null,
    action: "DELETE",
    resource: "WebhookEndpoint",
    resourceId: ep.id,
    before: { url: ep.url, events: ep.events },
  });
  return Response.json({ ok: true });
}
