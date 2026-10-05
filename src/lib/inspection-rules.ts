// Pure rules for inspection visits (condition reports run on site by a
// caretaker or a manager). No Prisma here — see src/lib/inspections.ts.
//
// Lifecycle: SCHEDULED → IN_PROGRESS → SUBMITTED → ACCEPTED.
//  - Observations (rooms, photos, comments, sign-off) can be changed only
//    while SCHEDULED / IN_PROGRESS. Once handed in they are locked: a manager
//    reviews them but never rewrites what was seen (owner decision 2026-10-05).
//  - A manager sends a SUBMITTED report back, or approves a caretaker's
//    request to correct an ACCEPTED one; either returns it to IN_PROGRESS.
//  - Keys are a handover log, not an observation: they may still be recorded
//    after submission (the manager often clears a move-in's keys later).

export type InspectionType = "MOVE_IN" | "MID_TERM" | "MOVE_OUT";
export type InspectionStatus = "SCHEDULED" | "IN_PROGRESS" | "SUBMITTED" | "ACCEPTED";
export type TenantSignOff = "SIGNED" | "ABSENT" | "REFUSED";
export type ItemStatus = "PERFECT" | "GOOD" | "FAIR" | "POOR";

/** Photos each room needs before the report can be handed in. */
export const MIN_PHOTOS_PER_ROOM = 3;

export const INSPECTION_TYPE_LABEL: Record<InspectionType, string> = {
  MOVE_IN: "Move-in",
  MID_TERM: "Mid-term",
  MOVE_OUT: "Move-out",
};

export const INSPECTION_STATUS_LABEL: Record<InspectionStatus, string> = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  SUBMITTED: "Awaiting review",
  ACCEPTED: "Accepted",
};

export const KEY_PRESETS = ["Main door", "Bedroom", "Gate", "Mailbox", "Remote / fob"] as const;

export type InspectionKey = { label: string; count: number };

export type InspectionItem = {
  id: string;
  room: string;
  feature: string;
  status: ItemStatus | null;
  notes?: string;
  photoIds: string[];
};

export function canEditObservations(status: InspectionStatus): boolean {
  return status === "SCHEDULED" || status === "IN_PROGRESS";
}

/** Who sits on the manager side of the review (ADMIN / MANAGER / ACCOUNTANT). */
export type InspectionActor = { isManager: boolean };

/** The keys step of an inspection: what the caretaker sees and may do. */
export type KeysState = "none" | "waiting" | "open" | "locked";

export function keysState(r: { reportType: InspectionType; status: InspectionStatus; keysClearedAt: Date | string | null }): KeysState {
  if (r.reportType === "MID_TERM") return "none";
  if (r.status === "ACCEPTED") return "locked";
  if (r.reportType === "MOVE_IN" && !r.keysClearedAt) return "waiting";
  return "open";
}

export function normaliseKeys(raw: unknown): InspectionKey[] {
  if (!Array.isArray(raw)) return [];
  const out: InspectionKey[] = [];
  for (const k of raw) {
    if (!k || typeof k !== "object") continue;
    const label = String((k as { label?: unknown }).label ?? "").trim().slice(0, 60);
    const count = Math.floor(Number((k as { count?: unknown }).count));
    if (!label || !Number.isFinite(count) || count <= 0) continue;
    out.push({ label, count: Math.min(count, 99) });
  }
  return out;
}

/** Rooms in walkthrough order, each with the photos its features hold. */
export function roomPhotoCounts(items: InspectionItem[], existingPhotoIds: Set<string>): { room: string; photos: number }[] {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const it of items) {
    if (!counts.has(it.room)) { counts.set(it.room, 0); order.push(it.room); }
    const n = (it.photoIds ?? []).filter((id) => existingPhotoIds.has(id)).length;
    counts.set(it.room, (counts.get(it.room) ?? 0) + n);
  }
  return order.map((room) => ({ room, photos: counts.get(room) ?? 0 }));
}

export type SubmitInput = {
  reportType: InspectionType;
  status: InspectionStatus;
  hasTenant: boolean;
  items: InspectionItem[];
  photoIds: Set<string>;
  tenantSignOff: TenantSignOff | null;
  tenantSignedName: string | null;
  tenantSignaturePath: string | null;
};

/** Everything still missing before the report can be handed in (empty = ready). */
export function submitProblems(r: SubmitInput): string[] {
  const problems: string[] = [];
  if (!canEditObservations(r.status)) problems.push("This report has already been handed in.");
  if ((r.reportType === "MOVE_IN" || r.reportType === "MOVE_OUT") && !r.hasTenant) {
    problems.push(`A ${INSPECTION_TYPE_LABEL[r.reportType].toLowerCase()} inspection needs a tenant.`);
  }
  if (r.items.length === 0) problems.push("Add at least one room.");
  const unrated = r.items.filter((i) => !i.status).length;
  if (unrated > 0) problems.push(`${unrated} item${unrated === 1 ? "" : "s"} still need a condition.`);
  for (const { room, photos } of roomPhotoCounts(r.items, r.photoIds)) {
    if (photos < MIN_PHOTOS_PER_ROOM) {
      problems.push(`${room}: ${photos} of ${MIN_PHOTOS_PER_ROOM} photos.`);
    }
  }
  // No tenant (a mid-term on a vacant unit) means no sign-off to record.
  if (r.hasTenant && !r.tenantSignOff) problems.push("Record whether the tenant signed.");
  else if (r.hasTenant && r.tenantSignOff === "SIGNED") {
    if (!r.tenantSignaturePath) problems.push("Capture the tenant's signature.");
    if (!r.tenantSignedName?.trim()) problems.push("Type the name of the person who signed.");
  }
  return problems;
}

/** Items in poor condition (damage) — flagged in the submission email. */
export function damagedItems(items: InspectionItem[]): InspectionItem[] {
  return items.filter((i) => i.status === "POOR");
}

export type InspectionAction =
  | "clear_keys"      // manager: move-in keys may be handed over
  | "send_back"       // manager: return a SUBMITTED report to the caretaker
  | "request_edit"    // anyone ops: ask to correct a handed-in report
  | "approve_edit"    // manager: reopen for correction
  | "decline_edit";   // manager: refuse the correction

export type ActionDecision = { ok: true } | { ok: false; status: number; error: string };

export function decideInspectionAction(
  action: InspectionAction,
  r: {
    reportType: InspectionType;
    status: InspectionStatus;
    keysClearedAt: Date | string | null;
    editRequestedAt: Date | string | null;
  },
  actor: InspectionActor,
  note: string | null,
): ActionDecision {
  const managerOnly: InspectionAction[] = ["clear_keys", "send_back", "approve_edit", "decline_edit"];
  if (managerOnly.includes(action) && !actor.isManager) {
    return { ok: false, status: 403, error: "Only a manager can do that." };
  }
  switch (action) {
    case "clear_keys":
      if (r.reportType !== "MOVE_IN") return { ok: false, status: 400, error: "Only move-in inspections wait for the keys to be cleared." };
      if (r.keysClearedAt) return { ok: false, status: 409, error: "The keys are already cleared." };
      if (r.status === "ACCEPTED") return { ok: false, status: 409, error: "This report is already accepted." };
      return { ok: true };
    case "send_back":
      if (r.status !== "SUBMITTED") return { ok: false, status: 409, error: "Only a report awaiting review can be sent back." };
      if (!note?.trim()) return { ok: false, status: 400, error: "Say what needs to change." };
      return { ok: true };
    case "request_edit":
      if (r.status !== "SUBMITTED" && r.status !== "ACCEPTED") return { ok: false, status: 409, error: "This report can still be edited directly." };
      if (r.editRequestedAt) return { ok: false, status: 409, error: "A change is already waiting for the manager." };
      if (!note?.trim()) return { ok: false, status: 400, error: "Say what you need to correct." };
      return { ok: true };
    case "approve_edit":
    case "decline_edit":
      if (!r.editRequestedAt) return { ok: false, status: 409, error: "No change was requested." };
      if (action === "decline_edit" && !note?.trim()) return { ok: false, status: 400, error: "Say why the change is declined." };
      return { ok: true };
  }
}
