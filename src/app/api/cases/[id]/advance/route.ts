import { requireManager, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { advanceCaseSchema } from "@/lib/validations";
import { advanceCase, getStageByIndex, getStageByKey, getWorkflow } from "@/lib/case-workflows";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const thread = await prisma.caseThread.findUnique({ where: { id: params.id } });
  if (!thread) return Response.json({ error: "Not found" }, { status: 404 });

  const access = await requirePropertyAccess(thread.propertyId);
  if (!access.ok) return access.error!;

  const body = await req.json();
  const parsed = advanceCaseSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const wf = getWorkflow(thread.caseType);
  let toIndex = -1;
  if (parsed.data.to !== undefined) {
    toIndex = parsed.data.to;
  } else if (parsed.data.toKey) {
    const t = getStageByKey(wf, parsed.data.toKey);
    if (!t) return Response.json({ error: "Unknown stage key" }, { status: 400 });
    toIndex = t.index;
  }
  if (!getStageByIndex(wf, toIndex)) {
    return Response.json({ error: "Stage index out of bounds" }, { status: 400 });
  }
  if (toIndex <= thread.currentStageIndex) {
    return Response.json({ error: "advance must go forward — use /regress to go back" }, { status: 400 });
  }

  await advanceCase(thread.id, toIndex, {
    actorUserId: session!.user.id,
    actorEmail: session!.user.email ?? null,
    actorName: session!.user.name ?? null,
    note: parsed.data.note,
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "CaseThread",
    resourceId: thread.id,
    organizationId: thread.organizationId,
    before: { currentStageIndex: thread.currentStageIndex },
    after: { currentStageIndex: toIndex, note: parsed.data.note ?? null },
  });

  return Response.json({ ok: true, currentStageIndex: toIndex });
}
