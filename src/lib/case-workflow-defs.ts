// Pure workflow definitions — NO runtime imports. This module is imported by
// client components (case detail page, StageTracker), so it must never pull
// in the Prisma client: doing so crashes the browser bundle at hydration
// ("Extensions.defineExtension is unable to run in this browser environment").
// Server-side advance/auto-advance logic lives in case-workflows.ts, which
// re-exports everything here.
import type { CaseStatus, CaseType, CaseWaitingOn } from "@prisma/client";

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

// `eviction` exists so the legacy ArrearsStage.EVICTION has somewhere to land.
// Collapsing it into `legal_action` would understate a tenant's actual legal
// position, which is not an acceptable rounding error in a debt record.
//
// NOTE: inserting a stage shifts the indices of everything after it, and
// getWorkflow() resolves by caseType rather than the thread's stored
// workflowKey — so `npm run arrears:consolidate` remaps existing ARREARS
// threads by stage *label*, never by index.
const ARREARS_V1: CaseWorkflow = {
  key: "ARREARS_V1",
  caseType: "ARREARS",
  // 0, unlike every other workflow — and deliberately.
  //
  // Elsewhere, finishing the ladder is success. In arrears the ladder is an
  // escalation you hope to avoid: a tenant who pays after the informal reminder
  // is the BEST outcome, not a bypassed process. With this at 3, resolving at
  // stage 0 rendered as terminalReason=BYPASSED — amber banner, struck-through
  // stages — i.e. the UI reported your best result as a process failure.
  // At 0, every terminal resolution is COMPLETED_NORMALLY.
  naturalCompletionIndex: 0,
  stages: [
    { key: "informal_reminder", label: "Informal reminder", defaultSlaHours: 72 },
    { key: "formal_notice",     label: "Formal notice",     defaultSlaHours: 168 },
    { key: "demand_letter",     label: "Demand letter",     defaultSlaHours: 336 },
    { key: "legal_action",      label: "Legal action",      defaultSlaHours: null },
    { key: "eviction",          label: "Eviction",          defaultSlaHours: null },
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

// Tenant complaints (src/lib/complaint-rules.ts drives the transitions).
// naturalCompletionIndex = 1: resolving straight from "Acknowledged" is the
// normal outcome for most complaints ("spoke to the neighbour, sorted") and
// must not render as BYPASSED — only a complaint closed while still
// "Received" is a bypass. `received` SLA is overridden from the management
// agreement's kpiStandardResponseHrs (computeDefaultStageSlaHours).
const COMPLAINT_V1: CaseWorkflow = {
  key: "COMPLAINT_V1",
  caseType: "COMPLAINT",
  naturalCompletionIndex: 1, // `acknowledged`
  stages: [
    { key: "received",        label: "Received",        defaultSlaHours: 24,  requiresAction: "MANAGER" },
    { key: "acknowledged",    label: "Acknowledged",    defaultSlaHours: 72,  requiresAction: "MANAGER" },
    { key: "investigating",   label: "Investigating",   defaultSlaHours: 120, requiresAction: "MANAGER" },
    { key: "awaiting_tenant", label: "Awaiting tenant", defaultSlaHours: null, requiresAction: "TENANT" },
    { key: "resolved",        label: "Resolved",        terminal: true, terminalStatus: "RESOLVED" },
    { key: "closed",          label: "Closed",          terminal: true, terminalStatus: "CLOSED" },
  ],
};

export const WORKFLOWS: Record<CaseType, CaseWorkflow> = {
  MAINTENANCE:   MAINTENANCE_V1,
  LEASE_RENEWAL: LEASE_RENEWAL_V1,
  ARREARS:       ARREARS_V1,
  COMPLIANCE:    COMPLIANCE_V1,
  GENERAL:       GENERAL_V1,
  COMPLAINT:     COMPLAINT_V1,
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
  // Complaints: one agreement-level response SLA for acknowledgement, the
  // same figure maintenance triage uses. Workflow defaults cover the rest.
  if (wf.caseType === "COMPLAINT" && opts?.agreement) {
    const hrs = opts.agreement.kpiStandardResponseHrs;
    if (typeof hrs === "number" && hrs > 0) map.received = hrs;
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

