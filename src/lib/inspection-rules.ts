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

export type InspectionType = "MOVE_IN" | "MID_TERM" | "MOVE_OUT" | "POST_STAY";
export type InspectionStatus = "SCHEDULED" | "IN_PROGRESS" | "SUBMITTED" | "ACCEPTED";
export type TenantSignOff = "SIGNED" | "ABSENT" | "REFUSED";
export type ItemStatus = "PERFECT" | "GOOD" | "FAIR" | "POOR";

/** Photos each room needs before a long-term report can be handed in. */
export const MIN_PHOTOS_PER_ROOM = 3;

export const INSPECTION_TYPE_LABEL: Record<InspectionType, string> = {
  MOVE_IN: "Move-in",
  MID_TERM: "Mid-term",
  MOVE_OUT: "Move-out",
  POST_STAY: "Post-stay",
};

// ── Post-stay checks (short-stay guests) ─────────────────────────────────────
// A quick check after each stay (owner decision 2026-10-06): one rating per
// room — fine or damaged — with at least one photo per room, and a note and a
// photo of anything damaged. Rated GOOD / POOR so the damage rules
// (damagedItems, repair jobs) work unchanged.

export const POST_STAY_FEATURE = "Overall";

/** Photos each room needs before the report can be handed in. */
export function minPhotosPerRoom(type: InspectionType): number {
  return type === "POST_STAY" ? 1 : MIN_PHOTOS_PER_ROOM;
}

/** The condition buttons offered for an item, with their labels. */
export function ratingOptions(type: InspectionType): { value: ItemStatus; label: string }[] {
  if (type === "POST_STAY") return [{ value: "GOOD", label: "Fine" }, { value: "POOR", label: "Damaged" }];
  return (["PERFECT", "GOOD", "FAIR", "POOR"] as ItemStatus[]).map((value) => ({ value, label: value }));
}

export function itemStatusLabel(type: InspectionType, status: ItemStatus | null): string {
  if (!status) return "not rated";
  if (type === "POST_STAY") return status === "POOR" || status === "FAIR" ? "Damaged" : "Fine";
  return status;
}

/** One "Overall" item per room, in order. */
export function postStayItems(rooms: string[], newId: () => string): InspectionItem[] {
  const seen = new Set<string>();
  const out: InspectionItem[] = [];
  for (const raw of rooms) {
    const room = raw.trim();
    if (!room || seen.has(room)) continue;
    seen.add(room);
    out.push({ id: newId(), room, feature: POST_STAY_FEATURE, status: null, notes: "", photoIds: [] });
  }
  return out;
}

/** A handed-in post-stay check with nothing to review: no damage, no issues raised. */
export function isCleanPostStay(r: { reportType: InspectionType; items: InspectionItem[]; tenantIssues: string | null }): boolean {
  return r.reportType === "POST_STAY" && damagedItems(r.items).length === 0 && !r.tenantIssues?.trim();
}

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
  /** Maintenance job raised from this item's damage. */
  jobId?: string;
};

export function canEditObservations(status: InspectionStatus): boolean {
  return status === "SCHEDULED" || status === "IN_PROGRESS";
}

/** Who sits on the manager side of the review (ADMIN / MANAGER / ACCOUNTANT). */
export type InspectionActor = { isManager: boolean };

/** The keys step of an inspection: what the caretaker sees and may do. */
export type KeysState = "none" | "waiting" | "open" | "locked";

export function keysState(r: { reportType: InspectionType; status: InspectionStatus; keysClearedAt: Date | string | null }): KeysState {
  // A guest's keys are on the stay record (GuestStay), not the inspection.
  if (r.reportType === "MID_TERM" || r.reportType === "POST_STAY") return "none";
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
  /** The unit's active meters and the readings taken (optional for older callers). */
  meters?: InspectionMeter[];
  meterReadings?: { meterId: string }[];
};

/** Everything still missing before the report can be handed in (empty = ready). */
export function submitProblems(r: SubmitInput): string[] {
  const problems: string[] = [];
  if (!canEditObservations(r.status)) problems.push("This report has already been handed in.");
  if ((r.reportType === "MOVE_IN" || r.reportType === "MOVE_OUT") && !r.hasTenant) {
    problems.push(`A ${INSPECTION_TYPE_LABEL[r.reportType].toLowerCase()} inspection needs a tenant.`);
  }
  if (r.items.length === 0) problems.push("Add at least one room.");
  for (const m of missingMeterReadings(r.reportType, r.meters ?? [], r.meterReadings ?? [])) {
    problems.push(`Take the ${m.label} reading.`);
  }
  const unrated = r.items.filter((i) => !i.status).length;
  if (unrated > 0) problems.push(`${unrated} item${unrated === 1 ? "" : "s"} still need a condition.`);
  const minPhotos = minPhotosPerRoom(r.reportType);
  for (const { room, photos } of roomPhotoCounts(r.items, r.photoIds)) {
    if (photos < minPhotos) {
      problems.push(`${room}: ${photos} of ${minPhotos} photo${minPhotos === 1 ? "" : "s"}.`);
    }
  }
  if (r.reportType === "POST_STAY") {
    for (const it of damagedItems(r.items)) {
      if (!it.notes?.trim()) problems.push(`${it.room}: say what is damaged.`);
      if (!(it.photoIds ?? []).some((id) => r.photoIds.has(id))) problems.push(`${it.room}: photograph the damage.`);
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

// ── Meter readings taken on the visit ────────────────────────────────────────
// Evidence on the report (opening readings at move-in, final at move-out); the
// month-end readings still drive billing. A move-out's readings pre-fill the
// checkout's final meter readings.

export type InspectionMeter = { meterId: string; utility: "WATER" | "ELECTRICITY"; label: string; lastReading: number | null };
export type InspectionMeterReading = { meterId: string; utility: "WATER" | "ELECTRICITY"; label: string; reading: number; lastReading: number | null };

/**
 * Keeps readings for the unit's own meters only, snapshotting each meter's
 * utility, label and last known reading. A blank / non-numeric / negative
 * value drops the meter's reading.
 */
export function normaliseMeterReadings(raw: unknown, meters: InspectionMeter[]): InspectionMeterReading[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map(meters.map((m) => [m.meterId, m]));
  const out: InspectionMeterReading[] = [];
  for (const r of raw) {
    const meterId = String((r as { meterId?: unknown })?.meterId ?? "");
    const m = byId.get(meterId);
    const value = (r as { reading?: unknown })?.reading;
    const reading = typeof value === "string" && value.trim() === "" ? NaN : Number(value);
    if (!m || !Number.isFinite(reading) || reading < 0 || out.some((x) => x.meterId === meterId)) continue;
    out.push({ meterId, utility: m.utility, label: m.label, reading: Math.round(reading * 1000) / 1000, lastReading: m.lastReading });
  }
  return out;
}

/** A reading below the meter's last known reading — usually a misread. */
export function readingBelowLast(r: { reading: number; lastReading: number | null }): boolean {
  return r.lastReading !== null && r.reading < r.lastReading;
}

/** Move-in and move-out need a reading for every active unit meter. */
export function missingMeterReadings(
  reportType: InspectionType,
  meters: InspectionMeter[],
  readings: { meterId: string }[],
): InspectionMeter[] {
  if (reportType !== "MOVE_IN" && reportType !== "MOVE_OUT") return [];
  const have = new Set(readings.map((r) => r.meterId));
  return meters.filter((m) => !have.has(m.meterId));
}
