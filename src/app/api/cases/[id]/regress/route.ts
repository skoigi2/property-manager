import { requireManager, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { regressCaseSchema } from "@/lib/validations";
import { getStageByIndex, getWorkflow } from "@/lib/case-workflows";
import type { CaseStatus, CaseWaitingOn, Prisma } from "@prisma/client";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const thread = await prisma.caseThread.findUnique({ where: { id: params.id } });
  if (!thread) return Response.json({ error: "Not found" }, { status: 404 });

  const access = await requirePropertyAccess(thread.propertyId);
  if (!access.ok) return access.error!;

  const body = await req.json();
  const parsed = regressCaseSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  if (thread.currentStageIndex <= 0) {
    return Response.json({ error: "Already at first stage" }, { status: 400 });
  }
  const toIndex = thread.currentStageIndex - 1;
  const wf = getWorkflow(thread.caseType);
  const targetStage = getStageByIndex(wf, toIndex)!;
  const now = new Date();

  const newWaitingOn: CaseWaitingOn = targetStage.requiresAction ?? "MANAGER";
  const externalNow = newWaitingOn !== "MANAGER" && newWaitingOn !== "NONE";
  const externalBefore = thread.waitingOn !== "MANAGER" && thread.waitingOn !== "NONE";

  let waitingPausedSeconds = thread.waitingPausedSeconds;
  let lastWaitingPauseAt: Date | null = thread.lastWaitingPauseAt;
  if (externalBefore && !externalNow && thread.lastWaitingPauseAt) {
    waitingPausedSeconds += Math.floor((now.getTime() - thread.lastWaitingPauseAt.getTime()) / 1000);
    lastWaitingPauseAt = null;
  } else if (!externalBefore && externalNow) {
    lastWaitingPauseAt = now;
  }

  // Regressing out of a terminal stage clears terminalReason and re-opens the case
  const wasTerminalStage = !!getStageByIndex(wf, thread.currentStageIndex)?.terminalStatus;
  const statusUnsnap: { status?: CaseStatus; terminalReason?: null; bypassedAtStage?: null } = {};
  if (wasTerminalStage && (thread.status === "RESOLVED" || thread.status === "CLOSED")) {
    statusUnsnap.status = "IN_PROGRESS";
    statusUnsnap.terminalReason = null;
    statusUnsnap.bypassedAtStage = null;
  }

  await prisma.$transaction([
    prisma.caseThread.update({
      where: { id: thread.id },
      data: {
        currentStageIndex: toIndex,
        stage: targetStage.label,
        stageStartedAt: now,
        lastActivityAt: now,
        waitingOn: newWaitingOn,
        waitingPausedSeconds,
        lastWaitingPauseAt,
        ...statusUnsnap,
      },
    }),
    prisma.caseEvent.create({
      data: {
        caseThreadId: thread.id,
        kind: "STAGE_CHANGE",
        actorUserId: session!.user.id,
        actorEmail: session!.user.email ?? null,
        actorName: session!.user.name ?? null,
        body: `Regressed to "${targetStage.label}": ${parsed.data.reason}`,
        meta: { from: thread.currentStageIndex, to: toIndex, toKey: targetStage.key, reason: parsed.data.reason, regression: true } as Prisma.InputJsonValue,
      },
    }),
  ]);

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "CaseThread",
    resourceId: thread.id,
    organizationId: thread.organizationId,
    before: { currentStageIndex: thread.currentStageIndex },
    after: { currentStageIndex: toIndex, reason: parsed.data.reason },
  });

  return Response.json({ ok: true, currentStageIndex: toIndex });
}
