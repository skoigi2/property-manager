import { requireManager, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { setSlaSchema } from "@/lib/validations";
import { getStageByIndex, getWorkflow } from "@/lib/case-workflows";
import type { Prisma } from "@prisma/client";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const thread = await prisma.caseThread.findUnique({ where: { id: params.id } });
  if (!thread) return Response.json({ error: "Not found" }, { status: 404 });

  const access = await requirePropertyAccess(thread.propertyId);
  if (!access.ok) return access.error!;

  const body = await req.json();
  const parsed = setSlaSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  // Apply either a full map, or a legacy single slaHours mapped onto the current stage.
  let nextMap: Record<string, number | null>;
  if (parsed.data.stageSlaHours) {
    nextMap = parsed.data.stageSlaHours;
  } else {
    const wf = getWorkflow(thread.caseType);
    const cur = getStageByIndex(wf, thread.currentStageIndex);
    if (!cur) return Response.json({ error: "Current stage not in workflow" }, { status: 400 });
    nextMap = { ...(thread.stageSlaHours as Record<string, number | null> ?? {}) };
    nextMap[cur.key] = parsed.data.slaHours ?? null;
  }

  const updated = await prisma.caseThread.update({
    where: { id: thread.id },
    data: { stageSlaHours: nextMap as Prisma.InputJsonValue },
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "CaseThread",
    resourceId: thread.id,
    organizationId: thread.organizationId,
    before: { stageSlaHours: thread.stageSlaHours },
    after: { stageSlaHours: updated.stageSlaHours },
  });

  return Response.json({ stageSlaHours: updated.stageSlaHours });
}
