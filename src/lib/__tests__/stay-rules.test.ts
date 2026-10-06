import { describe, it, expect } from "vitest";
import { decideStayAction, stayIdState, stayStage, guestHasKeys, EMPTY_STAY, type StayRecord } from "@/lib/stay-rules";

const T = "2026-10-06T08:00:00.000Z";
const rec = (over: Partial<StayRecord> = {}): StayRecord => ({ ...EMPTY_STAY, ...over });
const staff = { isManager: false };
const manager = { isManager: true };

describe("stayIdState", () => {
  it("is ok once the main guest (primary, else first) has a document", () => {
    expect(stayIdState([{ isPrimary: true, documentCount: 1 }], null)).toBe("ok");
    expect(stayIdState([{ isPrimary: false, documentCount: 1 }, { isPrimary: true, documentCount: 0 }], null)).toBe("missing");
    expect(stayIdState([{ isPrimary: false, documentCount: 2 }, { isPrimary: false, documentCount: 0 }], null)).toBe("ok");
  });
  it("is missing with no guests, and overridden when a manager gave a reason", () => {
    expect(stayIdState([], null)).toBe("missing");
    expect(stayIdState([], "Saw the passport, guest refused a copy")).toBe("overridden");
    expect(stayIdState([], "  ")).toBe("missing");
  });
});

describe("decideStayAction", () => {
  it("won't hand over keys without the main guest's ID", () => {
    const d = decideStayAction("hand_keys", rec(), "missing", staff, { keys: [{ label: "Main door", count: 1 }] });
    expect(d).toMatchObject({ ok: false, status: 409, code: "ID_REQUIRED" });
  });
  it("hands over keys with the ID (or an override) and needs at least one key", () => {
    expect(decideStayAction("hand_keys", rec(), "ok", staff, { keys: [{ label: "Main door", count: 2 }] }))
      .toEqual({ ok: true, keys: [{ label: "Main door", count: 2 }] });
    expect(decideStayAction("hand_keys", rec(), "overridden", staff, { keys: [{ label: "Main door", count: 1 }] }).ok).toBe(true);
    expect(decideStayAction("hand_keys", rec(), "ok", staff, { keys: [] })).toMatchObject({ ok: false, status: 400 });
    expect(decideStayAction("hand_keys", rec({ keysHandedAt: T }), "ok", staff, { keys: [{ label: "Gate", count: 1 }] })).toMatchObject({ ok: false, status: 409 });
  });
  it("takes keys back only after they went out, once", () => {
    expect(decideStayAction("return_keys", rec(), "ok", staff, {})).toMatchObject({ ok: false, status: 409 });
    expect(decideStayAction("return_keys", rec({ keysHandedAt: T }), "ok", staff, {})).toEqual({ ok: true });
    expect(decideStayAction("return_keys", rec({ keysHandedAt: T, keysReturnedAt: T }), "ok", staff, {})).toMatchObject({ ok: false, status: 409 });
  });
  it("gives the cleaner keys once the guest no longer has them, with a name", () => {
    expect(decideStayAction("cleaner_out", rec({ keysHandedAt: T }), "ok", staff, { cleanerName: "Mary" })).toMatchObject({ ok: false, status: 409 });
    expect(decideStayAction("cleaner_out", rec({ keysHandedAt: T, keysReturnedAt: T }), "ok", staff, { cleanerName: " " })).toMatchObject({ ok: false, status: 400 });
    expect(decideStayAction("cleaner_out", rec({ keysHandedAt: T, keysReturnedAt: T }), "ok", staff, { cleanerName: " Mary " }))
      .toEqual({ ok: true, cleanerName: "Mary" });
    // No keys ever recorded (a keybox) — the cleaner can still go in.
    expect(decideStayAction("cleaner_out", rec(), "missing", staff, { cleanerName: "Mary" }).ok).toBe(true);
    expect(decideStayAction("cleaner_back", rec(), "ok", staff, {})).toMatchObject({ ok: false, status: 409 });
    expect(decideStayAction("cleaner_back", rec({ cleanerKeysOutAt: T }), "ok", staff, {})).toEqual({ ok: true });
  });
  it("lets only a manager override the ID, with a reason, before the keys go", () => {
    expect(decideStayAction("override_id", rec(), "missing", staff, { reason: "x" })).toMatchObject({ ok: false, status: 403 });
    expect(decideStayAction("override_id", rec(), "missing", manager, { reason: "" })).toMatchObject({ ok: false, status: 400 });
    expect(decideStayAction("override_id", rec(), "ok", manager, { reason: "x" })).toMatchObject({ ok: false, status: 409 });
    expect(decideStayAction("override_id", rec(), "missing", manager, { reason: " Passport seen " })).toEqual({ ok: true, reason: "Passport seen" });
  });
  it("undoes only the latest step of each chain, managers only", () => {
    const out = rec({ keysHandedAt: T });
    const back = rec({ keysHandedAt: T, keysReturnedAt: T });
    const cleaning = rec({ keysHandedAt: T, keysReturnedAt: T, cleanerKeysOutAt: T });
    expect(decideStayAction("undo", out, "ok", staff, { step: "keys_out" })).toMatchObject({ ok: false, status: 403 });
    expect(decideStayAction("undo", out, "ok", manager, { step: "keys_out" })).toEqual({ ok: true, step: "keys_out" });
    expect(decideStayAction("undo", back, "ok", manager, { step: "keys_out" })).toMatchObject({ ok: false, status: 409 });
    expect(decideStayAction("undo", back, "ok", manager, { step: "keys_back" })).toEqual({ ok: true, step: "keys_back" });
    expect(decideStayAction("undo", cleaning, "ok", manager, { step: "keys_back" })).toMatchObject({ ok: false, status: 409 });
    expect(decideStayAction("undo", cleaning, "ok", manager, { step: "cleaner_out" })).toEqual({ ok: true, step: "cleaner_out" });
    expect(decideStayAction("undo", cleaning, "ok", manager, { step: "cleaner_back" })).toMatchObject({ ok: false, status: 409 });
    expect(decideStayAction("undo", cleaning, "ok", manager, { step: "everything" })).toMatchObject({ ok: false, status: 400 });
  });
});

describe("stayStage", () => {
  const dates = { checkIn: "2026-10-05T00:00:00.000Z", checkOut: "2026-10-08T00:00:00.000Z", inspectionHandedIn: false };
  it("follows the stay through the day", () => {
    expect(stayStage({ ...rec(), ...dates }, "2026-10-04")).toBe("upcoming");
    expect(stayStage({ ...rec(), ...dates }, "2026-10-05")).toBe("arriving");
    expect(stayStage({ ...rec({ keysHandedAt: T }), ...dates }, "2026-10-08")).toBe("in_house");
    expect(stayStage({ ...rec({ keysHandedAt: T, keysReturnedAt: T }), ...dates }, "2026-10-08")).toBe("turnover");
    expect(stayStage({ ...rec({ keysHandedAt: T, keysReturnedAt: T, cleanerKeysOutAt: T, cleanerKeysBackAt: T }), ...dates, inspectionHandedIn: true }, "2026-10-08")).toBe("done");
  });
  it("still needs a turnover after check-out when no keys were recorded", () => {
    expect(stayStage({ ...rec(), ...dates }, "2026-10-08")).toBe("turnover");
    expect(stayStage({ ...rec({ cleanerKeysOutAt: T, cleanerKeysBackAt: T }), ...dates, inspectionHandedIn: true }, "2026-10-09")).toBe("done");
  });
  it("knows when the guest has the keys", () => {
    expect(guestHasKeys(rec({ keysHandedAt: T }))).toBe(true);
    expect(guestHasKeys(rec({ keysHandedAt: T, keysReturnedAt: T }))).toBe(false);
    expect(guestHasKeys(rec())).toBe(false);
  });
});
