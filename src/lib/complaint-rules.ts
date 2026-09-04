/**
 * Pure rules for tenant complaints — no prisma / next-auth imports so they
 * are unit-testable (complaint-rules.test.ts) and safe in client components.
 *
 * A complaint is a TenantComplaint row with a CaseThread (COMPLAINT_V1) behind
 * it. Stage moves happen through the named actions below rather than the
 * generic case advance/regress routes, so the on-site CARETAKER can work a
 * complaint without ever touching /api/cases (which leaks tenant financials).
 */
import { getWorkflow, getStageByKey } from "@/lib/case-workflow-defs";

export type ComplaintCategory = "NOISE" | "NEIGHBOUR" | "SECURITY" | "PREMISES" | "STAFF_CONDUCT" | "OTHER";

export const COMPLAINT_CATEGORY_LABEL: Record<ComplaintCategory, string> = {
  NOISE:         "Noise",
  NEIGHBOUR:     "Neighbour dispute",
  SECURITY:      "Security",
  PREMISES:      "Premises & services",
  STAFF_CONDUCT: "Staff conduct",
  OTHER:         "Other",
};

/**
 * STAFF_CONDUCT is manager-only end to end: the caretaker may be the subject,
 * so the role must never see that such a complaint exists (list, detail,
 * actions, search, create). Everyone else sees every category.
 */
export function hiddenCategoriesFor(orgRole: string | null | undefined): ComplaintCategory[] {
  return orgRole === "CARETAKER" ? ["STAFF_CONDUCT"] : [];
}

export function complaintVisibleTo(orgRole: string | null | undefined, category: string): boolean {
  return !hiddenCategoriesFor(orgRole).includes(category as ComplaintCategory);
}

/** Categories a role may pick when logging a complaint. */
export function categoriesSelectableBy(orgRole: string | null | undefined): ComplaintCategory[] {
  const hidden = hiddenCategoriesFor(orgRole);
  return (Object.keys(COMPLAINT_CATEGORY_LABEL) as ComplaintCategory[]).filter((c) => !hidden.includes(c));
}

// ─── Actions → stages ────────────────────────────────────────────────────────

export type ComplaintAction = "acknowledge" | "investigate" | "await_tenant" | "resolve" | "reopen" | "close";

export const COMPLAINT_ACTIONS: Record<ComplaintAction, {
  label: string;
  toStage: string;
  /** OPS = manager tier + CARETAKER; MANAGER = manager tier only. */
  roles: "OPS" | "MANAGER";
  /** Backward move (out of a terminal stage) — needs a reason. */
  reopen?: boolean;
}> = {
  acknowledge:  { label: "Acknowledge",       toStage: "acknowledged",    roles: "OPS" },
  investigate:  { label: "Start investigating", toStage: "investigating", roles: "OPS" },
  await_tenant: { label: "Awaiting tenant",   toStage: "awaiting_tenant", roles: "OPS" },
  resolve:      { label: "Mark resolved",     toStage: "resolved",        roles: "OPS" },
  reopen:       { label: "Reopen",            toStage: "investigating",   roles: "MANAGER", reopen: true },
  close:        { label: "Close",             toStage: "closed",          roles: "MANAGER" },
};

const MANAGER_TIER = new Set(["ADMIN", "MANAGER", "ACCOUNTANT"]);
const OPS_TIER = new Set(["ADMIN", "MANAGER", "ACCOUNTANT", "CARETAKER"]);

export type ComplaintActionDecision =
  | { ok: true; toIndex: number; toKey: string; reopen: boolean }
  | { ok: false; status: 400 | 403 | 409; error: string; code: string };

/**
 * Decide whether `action` may run against the complaint's current case state.
 * Forward-only except `reopen`, which is only valid from a terminal stage.
 */
export function decideComplaintAction(input: {
  orgRole: string | null | undefined;
  isSuperAdmin: boolean;
  action: ComplaintAction;
  currentStageIndex: number;
  note?: string | null;
}): ComplaintActionDecision {
  const def = COMPLAINT_ACTIONS[input.action];
  if (!def) return { ok: false, status: 400, error: "Unknown action", code: "UNKNOWN_ACTION" };

  const tier = def.roles === "MANAGER" ? MANAGER_TIER : OPS_TIER;
  if (!input.isSuperAdmin && !tier.has(input.orgRole ?? "")) {
    return { ok: false, status: 403, error: "Only a manager can do that.", code: "PERMISSION_DENIED" };
  }

  const wf = getWorkflow("COMPLAINT");
  const target = getStageByKey(wf, def.toStage);
  if (!target) return { ok: false, status: 400, error: "Unknown stage", code: "UNKNOWN_STAGE" };

  if (def.reopen) {
    const current = wf.stages[input.currentStageIndex];
    if (!current?.terminal) {
      return { ok: false, status: 409, error: "Only a resolved or closed complaint can be reopened.", code: "STAGE_ORDER" };
    }
    if (!input.note?.trim()) {
      return { ok: false, status: 400, error: "Say why the complaint is being reopened.", code: "NOTE_REQUIRED" };
    }
    return { ok: true, toIndex: target.index, toKey: target.stage.key, reopen: true };
  }

  if (target.index <= input.currentStageIndex) {
    return { ok: false, status: 409, error: "That step has already happened.", code: "STAGE_ORDER" };
  }
  return { ok: true, toIndex: target.index, toKey: target.stage.key, reopen: false };
}

/** Actions currently offered to a role given the case stage (for the UI). */
export function availableComplaintActions(orgRole: string | null | undefined, currentStageIndex: number, isSuperAdmin = false): ComplaintAction[] {
  return (Object.keys(COMPLAINT_ACTIONS) as ComplaintAction[]).filter(
    (a) => decideComplaintAction({ orgRole, isSuperAdmin, action: a, currentStageIndex, note: "x" }).ok,
  );
}
