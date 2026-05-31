import type {
  CaseStatus,
  CaseType,
  CaseWaitingOn,
  MaintenanceJob,
  MaintenanceStatus,
} from "@prisma/client";
import { getWorkflow, getStageByIndex, computeDefaultStageSlaHours } from "@/lib/case-workflows";

export function mapMaintenanceStatusToCase(s: MaintenanceStatus): CaseStatus {
  switch (s) {
    case "OPEN":           return "OPEN";
    case "IN_PROGRESS":    return "IN_PROGRESS";
    case "AWAITING_PARTS": return "AWAITING_VENDOR";
    case "DONE":           return "RESOLVED";
    case "CANCELLED":      return "CLOSED";
  }
}

export function mapMaintenanceWaitingOn(
  job: Pick<MaintenanceJob, "status" | "vendorId">
): CaseWaitingOn {
  switch (job.status) {
    case "OPEN":           return "MANAGER";
    case "IN_PROGRESS":    return job.vendorId ? "VENDOR" : "MANAGER";
    case "AWAITING_PARTS": return "VENDOR";
    case "DONE":
    case "CANCELLED":      return "NONE";
  }
}

export function summariseStatusChange(from: CaseStatus, to: CaseStatus): string {
  return `Status changed from ${from} to ${to}`;
}

/**
 * The current stage's SLA deadline for a case — i.e. when the case is "due" to
 * advance out of its current stage. Mirrors the elapsed/SLA logic used by the
 * cron's `checkCaseSlaBreaches`, but projects a due *date* instead of a breach.
 *
 * Returns `null` when the case is terminal (RESOLVED/CLOSED), has no started
 * stage, or the current stage carries no SLA. Paused time (waiting on
 * owner/tenant/vendor) is added back so the deadline pushes out, not in.
 */
export function computeCaseSlaDueDate(thread: {
  caseType: CaseType;
  status: CaseStatus;
  currentStageIndex: number;
  stageStartedAt: Date | string | null;
  stageSlaHours: unknown;
  waitingPausedSeconds: number | null;
}): Date | null {
  if (thread.status === "RESOLVED" || thread.status === "CLOSED") return null;
  if (!thread.stageStartedAt) return null;

  const wf = getWorkflow(thread.caseType);
  const stage = getStageByIndex(wf, thread.currentStageIndex);
  if (!stage) return null;

  const slaMap = (thread.stageSlaHours && typeof thread.stageSlaHours === "object"
    ? (thread.stageSlaHours as Record<string, number | null>)
    : computeDefaultStageSlaHours(wf));
  const slaHours = slaMap[stage.key] ?? computeDefaultStageSlaHours(wf)[stage.key];
  if (!slaHours || slaHours <= 0) return null;

  const started = new Date(thread.stageStartedAt).getTime();
  const pausedMs = (thread.waitingPausedSeconds ?? 0) * 1000;
  return new Date(started + slaHours * 60 * 60 * 1000 + pausedMs);
}
