import { requireManager } from "@/lib/auth-utils";
import { requireActiveSubscription } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const patchSchema = z.object({ enabled: z.boolean() });

// PATCH /api/automations/[id] — enable / disable an automation template.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;
  const locked = await requireActiveSubscription(session!.user.organizationId);
  if (locked) return locked;

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const template = await prisma.automationTemplate.findUnique({ where: { id: params.id } });
  if (!template || template.organizationId !== session!.user.organizationId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.automationTemplate.update({
    where: { id: params.id },
    data: { enabled: parsed.data.enabled },
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "AutomationTemplate",
    resourceId: updated.id,
    organizationId: session!.user.organizationId,
    before: { enabled: template.enabled },
    after: { enabled: updated.enabled },
  });

  return Response.json({ id: updated.id, enabled: updated.enabled });
}
