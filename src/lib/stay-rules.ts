// Pure rules for short-stay guests on site (Phase 3 of caretaker check-in /
// check-out). No Prisma here — see src/lib/stays.ts.
//
// A stay is an AIRBNB IncomeEntry (the booking, which carries the money) plus
// a GuestStay row (the on-site record). Order on site:
//   guest ID uploaded → keys to the guest → keys back → post-stay check →
//   keys to the cleaner → keys back from the cleaner.
// Owner decision 2026-10-06: keys wait until the main guest's ID is uploaded;
// a manager may override with a reason (e.g. ID seen, copy refused).

import { normaliseKeys, type InspectionKey } from "@/lib/inspection-rules";

export type StayIdState = "ok" | "missing" | "overridden";

export type StayGuestRef = { isPrimary: boolean; documentCount: number };

/** The main guest is the primary one, else the first linked. */
export function stayIdState(guests: StayGuestRef[], idOverrideReason: string | null): StayIdState {
  const main = guests.find((g) => g.isPrimary) ?? guests[0];
  if (main && main.documentCount > 0) return "ok";
  return idOverrideReason?.trim() ? "overridden" : "missing";
}

export type StayRecord = {
  idOverrideReason: string | null;
  keysHandedAt: Date | string | null;
  keysReturnedAt: Date | string | null;
  cleanerKeysOutAt: Date | string | null;
  cleanerKeysBackAt: Date | string | null;
};

export const EMPTY_STAY: StayRecord = {
  idOverrideReason: null, keysHandedAt: null, keysReturnedAt: null, cleanerKeysOutAt: null, cleanerKeysBackAt: null,
};

/** The guest has the keys right now. */
export function guestHasKeys(s: StayRecord): boolean {
  return !!s.keysHandedAt && !s.keysReturnedAt;
}

export type StayAction =
  | "hand_keys"      // keys to the guest (needs the main guest's ID)
  | "return_keys"    // keys back from the guest
  | "cleaner_out"    // keys to the cleaning supervisor
  | "cleaner_back"   // keys back from the cleaner
  | "override_id"    // manager: hand keys over without the ID on file
  | "undo";          // manager: clear a step recorded by mistake

export const UNDO_STEPS = ["keys_out", "keys_back", "cleaner_out", "cleaner_back"] as const;
export type UndoStep = (typeof UNDO_STEPS)[number];

export type StayActionInput = { keys?: unknown; cleanerName?: string | null; reason?: string | null; step?: string | null };

export type StayDecision =
  | { ok: true; keys?: InspectionKey[]; cleanerName?: string; reason?: string; step?: UndoStep }
  | { ok: false; status: number; error: string; code?: string };

const no = (status: number, error: string, code?: string): StayDecision => ({ ok: false, status, error, ...(code ? { code } : {}) });

/** The day before a yyyy-mm-dd day (servers run in UTC; this tolerates the time zone). */
function dayBefore(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function decideStayAction(
  action: StayAction,
  stay: StayRecord,
  idState: StayIdState,
  actor: { isManager: boolean },
  input: StayActionInput,
  /** The booking's check-out and today (yyyy-mm-dd) — for the cleaner's keys when none were handed over. */
  dates?: { checkOut: Date | string; today: string },
): StayDecision {
  if ((action === "override_id" || action === "undo") && !actor.isManager) return no(403, "Only a manager can do that.");
  switch (action) {
    case "hand_keys": {
      if (stay.keysHandedAt) return no(409, "The keys are already with the guest.");
      if (stay.cleanerKeysOutAt && !stay.cleanerKeysBackAt) return no(409, "The cleaner still has the keys — get them back first.");
      if (idState === "missing") return no(409, "Upload the main guest's ID before handing over the keys.", "ID_REQUIRED");
      const keys = normaliseKeys(input.keys);
      if (keys.length === 0) return no(400, "Say which keys the guest was given.");
      return { ok: true, keys };
    }
    case "return_keys":
      if (!stay.keysHandedAt) return no(409, "The keys were never handed over.");
      if (stay.keysReturnedAt) return no(409, "The keys are already back.");
      return { ok: true };
    case "cleaner_out": {
      if (guestHasKeys(stay)) return no(409, "Get the keys back from the guest first.");
      if (stay.cleanerKeysOutAt) return no(409, "The cleaner already has the keys.");
      // No keys ever handed over (a keybox): the clean is the after-stay one, so
      // wait for check-out — a pre-arrival tick would block the real turnover.
      if (!stay.keysHandedAt && dates && dates.today < dayBefore(dayOf(dates.checkOut))) {
        return no(409, "The guest hasn't checked out yet — record the cleaner's keys after check-out.");
      }
      const cleanerName = input.cleanerName?.trim().slice(0, 120) ?? "";
      if (!cleanerName) return no(400, "Who did you give the keys to?");
      return { ok: true, cleanerName };
    }
    case "cleaner_back":
      if (!stay.cleanerKeysOutAt) return no(409, "The cleaner was never given the keys.");
      if (stay.cleanerKeysBackAt) return no(409, "The cleaner already returned the keys.");
      return { ok: true };
    case "override_id": {
      if (idState === "ok") return no(409, "The main guest's ID is already uploaded.");
      if (stay.keysHandedAt) return no(409, "The keys are already with the guest.");
      const reason = input.reason?.trim().slice(0, 500) ?? "";
      if (!reason) return no(400, "Say why the keys can go without the ID.");
      return { ok: true, reason };
    }
    case "undo": {
      const step = UNDO_STEPS.find((s) => s === input.step);
      if (!step) return no(400, "Which step should be undone?");
      // Only the latest step of each chain, so the record never contradicts itself.
      if (step === "keys_out" && (!stay.keysHandedAt || stay.keysReturnedAt)) return no(409, "Undo the keys coming back first.");
      if (step === "keys_back" && (!stay.keysReturnedAt || stay.cleanerKeysOutAt)) return no(409, stay.keysReturnedAt ? "Undo the cleaner's keys first." : "The keys aren't marked back.");
      if (step === "cleaner_out" && (!stay.cleanerKeysOutAt || stay.cleanerKeysBackAt)) return no(409, stay.cleanerKeysBackAt ? "Undo the cleaner returning the keys first." : "The cleaner doesn't have the keys.");
      if (step === "cleaner_back" && !stay.cleanerKeysBackAt) return no(409, "The cleaner hasn't returned the keys.");
      return { ok: true, step };
    }
  }
}

// ── Where a stay is, for lists ───────────────────────────────────────────────
// Day comparisons use "yyyy-mm-dd" strings: check-in / check-out are stored as
// dates (UTC midnight), and "today" is the viewer's local day.

export type StayStage = "upcoming" | "arriving" | "in_house" | "turnover" | "done";

export const STAY_STAGE_LABEL: Record<StayStage, string> = {
  upcoming: "Upcoming",
  arriving: "Arriving",
  in_house: "In house",
  turnover: "Turnover",
  done: "Done",
};

export function dayOf(d: Date | string): string {
  return (typeof d === "string" ? d : d.toISOString()).slice(0, 10);
}

/** Hours the cleaner may hold the keys before it's chased. */
export const CLEANER_KEYS_GRACE_HOURS = 24;

export type OverdueStayKeys = { holder: "guest" | "cleaner"; since: Date };

/**
 * Keys that should be back by now (the daily alert, checkStayKeysNotBack):
 * the guest's once the check-out day has passed, the cleaner's once they've
 * had them CLEANER_KEYS_GRACE_HOURS. `since` is when the keys became late.
 */
export function overdueStayKeys(s: StayRecord, checkOut: Date | string, now: Date): OverdueStayKeys[] {
  const out: OverdueStayKeys[] = [];
  const today = dayOf(now);
  if (guestHasKeys(s) && today > dayOf(checkOut)) {
    const end = new Date(`${dayOf(checkOut)}T00:00:00.000Z`);
    out.push({ holder: "guest", since: new Date(end.getTime() + 86_400_000) });
  }
  if (s.cleanerKeysOutAt && !s.cleanerKeysBackAt) {
    const late = new Date(new Date(s.cleanerKeysOutAt).getTime() + CLEANER_KEYS_GRACE_HOURS * 3_600_000);
    if (now >= late) out.push({ holder: "cleaner", since: late });
  }
  return out;
}

export function stayStage(
  s: StayRecord & { checkIn: Date | string; checkOut: Date | string; inspectionHandedIn: boolean },
  today: string,
): StayStage {
  if (s.keysReturnedAt) return s.cleanerKeysBackAt && s.inspectionHandedIn ? "done" : "turnover";
  if (s.keysHandedAt) return "in_house";
  if (today < dayOf(s.checkIn)) return "upcoming";
  if (today < dayOf(s.checkOut)) return "arriving";
  // Past check-out without keys ever recorded (a keybox, or nobody logged it):
  // the turnover still has to happen. Lists only look back a few days.
  return s.cleanerKeysBackAt && s.inspectionHandedIn ? "done" : "turnover";
}
