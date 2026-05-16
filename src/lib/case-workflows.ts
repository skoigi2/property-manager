import type { CaseStatus, CaseType, CaseWaitingOn, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface CaseStage {
  key: string;
  label: string;
  terminal?: boolean;
  /** When the user manually advances *to* this stage, snap status to this value. */
  terminalStatus?: CaseStatus;
  requiresAction?: CaseWaitingOn;
  /** null = no SLA for this stage; undefined = workflow source decides */
  defaultSlaHours?: number | null;
}

export interface CaseWorkflow {
  key: string;
  caseType: CaseType;
  stages: CaseStage[];
  /**
   * The earliest stage index that counts as "natural completion". When status
   * is flipped to RESOLVED/CLOSED while the case is at or past this index,
   * terminalReason becomes COMPLETED_NORMALLY. Before this index, BYPASSED.
   */
  naturalCompletionIndex: number;
}

// ─── Workflow definitions ────────────────────────────────────────────────────

const MAINTENANCE_V1: CaseWorkflow = {
  key: "MAINTENANCE_V1",
  caseType: "MAINTENANCE",
  naturalCompletionIndex: 8, // `completed`
  stages: [
    { key: "reported",            label: "Reported" },
    // triaged + quote_requested SLAs are overridden from the management agreement
    { key: "triaged",             label: "Triaged",            defaultSlaHours: 96 },
    { key: "quote_requested",     label: "Quote requested",    defaultSlaHours: 96, requiresAction: "VENDOR" },
    { key: "quote_received",      label: "Quote received",     defaultSlaHours: 48 },
    { key: "approval_requested",  label: "Approval requested", defaultSlaHours: 72, requiresAction: "OWNER" },
    { key: "approved",            label: "Approved",           defaultSlaHours: 48 },
    { key: "scheduled",           label: "Scheduled",          defaultSlaHours: null },
    { key: "in_progress",         label: "In progress",        defaultSlaHours: 168 },
    { key: "completed",           label: "Completed",          defaultSlaHours: 168, terminalStatus: "RESOLVED" },
    { key: "invoiced",            label: "Invoiced",           defaultSlaHours: 336 },
    { key: "closed",              label: "Closed",             terminal: true, terminalStatus: "CLOSED" },
  ],
};

const LEASE_RENEWAL_V1: CaseWorkflow = {
  key: "LEASE_RENEWAL_V1",
  caseType: "LEASE_RENEWAL",
  naturalCompletionIndex: 6, // `documents_signed`
  stages: [
    { key: "notice_due",       label: "Notice due",       defaultSlaHours: 168 },
    { key: "notice_sent",      label: "Notice sent",      defaultSlaHours: 336, requiresAction: "TENANT" },
    { key: "terms_drafted",    label: "Terms drafted",    defaultSlaHours: 72 },
    { key: "terms_sent",       label: "Terms sent",       defaultSlaHours: 336, requiresAction: "TENANT" },
    { key: "negotiating",      label: "Negotiating",      defaultSlaHours: 504 },
    { key: "terms_agreed",     label: "Terms agreed",     defaultSlaHours: 168 },
    { key: "documents_signed", label: "Documents signed", defaultSlaHours: 72 },
    { key: "renewed",          label: "Renewed",          terminal: true, terminalStatus: "RESOLVED" },
  ],
};

const ARREARS_V1: CaseWorkflow = {
  key: "ARREARS_V1",
  caseType: "ARREARS",
  naturalCompletionIndex: 3, // `legal_action` (i.e. went through the escalation ladder)
  stages: [
    { key: "informal_reminder", label: "Informal reminder", defaultSlaHours: 72 },
    { key: "formal_notice",     label: "Formal notice",     defaultSlaHours: 168 },
    { key: "demand_letter",     label: "Demand letter",     defaultSlaHours: 336 },
    { key: "legal_action",      label: "Legal action",      defaultSlaHours: null },
    { key: "settled",           label: "Settled",           terminal: true, terminalStatus: "RESOLVED" },
    { key: "closed",            label: "Closed",            terminal: true, terminalStatus: "CLOSED" },
  ],
};

const COMPLIANCE_V1: CaseWorkflow = {
  key: "COMPLIANCE_V1",
  caseType: "COMPLIANCE",
  naturalCompletionIndex: 4, // `certificate_received`
  stages: [
    { key: "identified",           label: "Identified",           defaultSlaHours: 168 },
    { key: "quote_requested",      label: "Quote requested",      defaultSlaHours: 168, requiresAction: "VENDOR" },
    { key: "scheduled",            label: "Scheduled",            defaultSlaHours: null },
    { key: "in_progress",          label: "In progress",          defaultSlaHours: 336 },
    { key: "certificate_received", label: "Certificate received", defaultSlaHours: 72 },
    { key: "filed",                label: "Filed",                terminal: true, terminalStatus: "RESOLVED" },
  ],
};

const GENERAL_V1: CaseWorkflow = {
  key: "GENERAL_V1",
  caseType: "GENERAL",
  naturalCompletionIndex: 1, // `in_progress`
  stages: [
    { key: "open",        label: "Open",        defaultSlaHours: null },
    { key: "in_progress", label: "In progress", defaultSlaHours: null },
    { key: "resolved",    label: "Resolved",    terminal: true, terminalStatus: "RESOLVED" },
    { key: "closed",      label: "Closed",      terminal: true, terminalStatus: "CLOSED" },
  ],
};

export const WORKFLOWS: Record<CaseType, CaseWorkflow> = {
  MAINTENANCE:   MAINTENANCE_V1,
  LEASE_RENEWAL: LEASE_RENEWAL_V1,
  ARREARS:       ARREARS_V1,
  COMPLIANCE:    COMPLIANCE_V1,
  GENERAL:       GENERAL_V1,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getWorkflow(caseType: CaseType): CaseWorkflow {
  return WORKFLOWS[caseType];
}

export function getStageByKey(wf: CaseWorkflow, key: string): { index: number; stage: CaseStage } | null {
  const index = wf.stages.findIndex((s) => s.key === key);
  if (index < 0) return null;
  return { index, stage: wf.stages[index] };
}

export function getStageByIndex(wf: CaseWorkflow, index: number): CaseStage | null {
  if (index < 0 || index >= wf.stages.length) return null;
  return wf.stages[index];
}

/**
 * Build the per-stage SLA map for a new case. MAINTENANCE overrides `triaged`
 * and `quote_requested` from the property's management agreement when present.
 */
export function computeDefaultStageSlaHours(
  wf: CaseWorkflow,
  opts?: {
    isEmergency?: boolean;
    agreement?: { kpiEmergencyResponseHrs: number; kpiStandardResponseHrs: number } | null;
  },
): Record<string, number | null> {
  const map: Record<string, number | null> = {};
  for (const s of wf.stages) {
    map[s.key] = s.defaultSlaHours ?? null;
  }
  if (wf.caseType === "MAINTENANCE" && opts?.agreement) {
    const hrs = opts.isEmergency
      ? opts.agreement.kpiEmergencyResponseHrs
      : opts.agreement.kpiStandardResponseHrs;
    if (typeof hrs === "number" && hrs > 0) {
      map.triaged = hrs;
      map.quote_requested = hrs;
    }
  }
  return map;
}

// ─── Auto-advance rules ──────────────────────────────────────────────────────

export type AutoAdvanceTrigger =
  | { kind: "VENDOR_ASSIGNED" }
  | { kind: "APPROVAL_GRANTED" }
  | { kind: "MAINTENANCE_STATUS"; status: "OPEN" | "IN_PROGRESS" | "AWAITING_PARTS" | "DONE" | "CANCELLED" }
  | { kind: "INVOICE_PAID" };

export function getAutoAdvanceStage(
  caseThread: { caseType: CaseType; currentStageIndex: number },
  trigger: AutoAdvanceTrigger,
): { toIndex: number; toKey: string } | null {
  const wf = getWorkflow(caseThread.caseType);
  const cur = getStageByIndex(wf, caseThread.currentStageIndex);
  if (!cur) return null;

  if (wf.caseType !== "MAINTENANCE") return null;

  if (trigger.kind === "VENDOR_ASSIGNED" && cur.key === "triaged") {
    const next = getStageByKey(wf, "quote_requested");
    return next ? { toIndex: next.index, toKey: next.stage.key } : null;
  }
  if (trigger.kind === "APPROVAL_GRANTED" && cur.key === "approval_requested") {
    const next = getStageByKey(wf, "approved");
    return next ? { toIndex: next.index, toKey: next.stage.key } : null;
  }
  if (trigger.kind === "MAINTENANCE_STATUS" && trigger.status === "DONE") {
    const target = getStageByKey(wf, "completed");
    if (target && caseThread.currentStageIndex < target.index) {
      return { toIndex: target.index, toKey: target.stage.key };
    }
  }
  if (trigger.kind === "MAINTENANCE_STATUS" && trigger.status === "CANCELLED") {
    const target = getStageByKey(wf, "closed");
    if (target && caseThread.currentStageIndex < target.index) {
      return { toIndex: target.index, toKey: target.stage.key };
    }
  }
  if (trigger.kind === "INVOICE_PAID" && cur.key === "completed") {
    const next = getStageByKey(wf, "invoiced");
    return next ? { toIndex: next.index, toKey: next.stage.key } : null;
  }
  return null;
}

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
