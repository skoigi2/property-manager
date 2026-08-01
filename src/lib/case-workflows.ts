// Server-side case workflow engine: advance/regress core + auto-advance.
// The pure stage definitions live in case-workflow-defs.ts (client-safe) and
// are re-exported here so existing server imports keep working unchanged.
// CLIENT components must import from "@/lib/case-workflow-defs" instead.
import type { CaseStatus, CaseWaitingOn, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getWorkflow,
  getStageByIndex,
  getAutoAdvanceStage,
  type AutoAdvanceTrigger,
} from "@/lib/case-workflow-defs";

export * from "@/lib/case-workflow-defs";

/**
 * Best-effort auto-advance — never throws. Use after the primary write commits.
 * Reads the current case, applies a single advance step, writes the STAGE_CHANGE
 * CaseEvent + updates the thread. Pause-clock math is applied via advanceCase.
 */
export async function tryAutoAdvance(caseId: string, trigger: AutoAdvanceTrigger): Promise<void> {
  try {
    const thread = await prisma.caseThread.findUnique({
      where: { id: caseId },
      select: { id: true, caseType: true, currentStageIndex: true, waitingOn: true, lastWaitingPauseAt: true, waitingPausedSeconds: true },
    });
    if (!thread) return;
    const target = getAutoAdvanceStage(thread, trigger);
    if (!target) return;

    await advanceCase(caseId, target.toIndex, {
      actorName: "system",
      note: `Auto-advance from ${trigger.kind.toLowerCase()}`,
    });
  } catch (e) {
    console.error("tryAutoAdvance failed:", e);
  }
}

// ─── Shared advance/regress core ─────────────────────────────────────────────

interface AdvanceActor {
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorName?: string | null;
  note?: string;
}

export async function advanceCase(caseId: string, toIndex: number, actor: AdvanceActor): Promise<void> {
  const thread = await prisma.caseThread.findUnique({
    where: { id: caseId },
    select: {
      id: true, caseType: true, currentStageIndex: true, waitingOn: true,
      lastWaitingPauseAt: true, waitingPausedSeconds: true,
    },
  });
  if (!thread) return;

  const wf = getWorkflow(thread.caseType);
  const targetStage = getStageByIndex(wf, toIndex);
  if (!targetStage) return;
  if (toIndex === thread.currentStageIndex) return;

  const now = new Date();
  // Resolve waitingOn from new stage's requiresAction
  const newWaitingOn: CaseWaitingOn = targetStage.requiresAction ?? "MANAGER";
  const externalNow = newWaitingOn !== "MANAGER" && newWaitingOn !== "NONE";
  const externalBefore = thread.waitingOn !== "MANAGER" && thread.waitingOn !== "NONE";

  let newWaitingPausedSeconds = thread.waitingPausedSeconds;
  let newLastWaitingPauseAt: Date | null = thread.lastWaitingPauseAt;
  if (externalBefore && !externalNow && thread.lastWaitingPauseAt) {
    // resuming clock
    newWaitingPausedSeconds += Math.floor((now.getTime() - thread.lastWaitingPauseAt.getTime()) / 1000);
    newLastWaitingPauseAt = null;
  } else if (!externalBefore && externalNow) {
    newLastWaitingPauseAt = now;
  }

  // If advancing TO a stage with terminalStatus, snap CaseThread.status accordingly
  // and mark terminalReason = COMPLETED_NORMALLY (the user explicitly walked the workflow).
  const statusSnap: { status?: CaseStatus; terminalReason?: "COMPLETED_NORMALLY" } = {};
  if (targetStage.terminalStatus) {
    statusSnap.status = targetStage.terminalStatus;
    statusSnap.terminalReason = "COMPLETED_NORMALLY";
  }

  await prisma.$transaction([
    prisma.caseThread.update({
      where: { id: caseId },
      data: {
        currentStageIndex: toIndex,
        stage: targetStage.label,
        stageStartedAt: now,
        lastActivityAt: now,
        waitingOn: newWaitingOn,
        waitingPausedSeconds: newWaitingPausedSeconds,
        lastWaitingPauseAt: newLastWaitingPauseAt,
        ...statusSnap,
      },
    }),
    prisma.caseEvent.create({
      data: {
        caseThreadId: caseId,
        kind: "STAGE_CHANGE",
        actorUserId: actor.actorUserId ?? null,
        actorEmail: actor.actorEmail ?? null,
        actorName: actor.actorName ?? null,
        body: `Advanced to "${targetStage.label}"${actor.note ? `: ${actor.note}` : ""}`,
        meta: { from: thread.currentStageIndex, to: toIndex, toKey: targetStage.key, note: actor.note ?? null } as Prisma.InputJsonValue,
      },
    }),
  ]);

  // Clear any SLA breach hint for this case — outside the transaction
  try {
    await prisma.actionableHint.updateMany({
      where: { hintType: "SLA_BREACH", refId: caseId, status: "ACTIVE" },
      data: { status: "ACTED_ON", actedAt: now },
    });
  } catch { /* best-effort */ }
}
