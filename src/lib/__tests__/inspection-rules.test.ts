import { describe, it, expect } from "vitest";
import {
  canEditObservations, keysState, normaliseKeys, roomPhotoCounts, submitProblems,
  decideInspectionAction, damagedItems, MIN_PHOTOS_PER_ROOM, type InspectionItem, type SubmitInput,
  normaliseMeterReadings, readingBelowLast, missingMeterReadings,
  minPhotosPerRoom, ratingOptions, itemStatusLabel, postStayItems, isCleanPostStay,
} from "@/lib/inspection-rules";

const item = (id: string, room: string, photoIds: string[] = [], status: InspectionItem["status"] = "GOOD"): InspectionItem =>
  ({ id, room, feature: `F${id}`, status, notes: "", photoIds });

function ready(over: Partial<SubmitInput> = {}): SubmitInput {
  return {
    reportType: "MOVE_IN",
    status: "IN_PROGRESS",
    hasTenant: true,
    items: [item("1", "Kitchen", ["p1", "p2"]), item("2", "Kitchen", ["p3"]), item("3", "Bathroom", ["p4", "p5", "p6"])],
    photoIds: new Set(["p1", "p2", "p3", "p4", "p5", "p6"]),
    tenantSignOff: "SIGNED",
    tenantSignedName: "Faith Chebet",
    tenantSignaturePath: "condition-reports/r1/signature.png",
    ...over,
  };
}

describe("canEditObservations", () => {
  it("is open before hand-in and locked after", () => {
    expect(canEditObservations("SCHEDULED")).toBe(true);
    expect(canEditObservations("IN_PROGRESS")).toBe(true);
    expect(canEditObservations("SUBMITTED")).toBe(false);
    expect(canEditObservations("ACCEPTED")).toBe(false);
  });
});

describe("keysState", () => {
  it("has no keys step for a mid-term inspection", () => {
    expect(keysState({ reportType: "MID_TERM", status: "IN_PROGRESS", keysClearedAt: null })).toBe("none");
  });
  it("waits for the manager on a move-in until cleared", () => {
    expect(keysState({ reportType: "MOVE_IN", status: "IN_PROGRESS", keysClearedAt: null })).toBe("waiting");
    expect(keysState({ reportType: "MOVE_IN", status: "SUBMITTED", keysClearedAt: new Date() })).toBe("open");
  });
  it("lets keys be returned on a move-out without clearance", () => {
    expect(keysState({ reportType: "MOVE_OUT", status: "IN_PROGRESS", keysClearedAt: null })).toBe("open");
  });
  it("locks once accepted", () => {
    expect(keysState({ reportType: "MOVE_OUT", status: "ACCEPTED", keysClearedAt: null })).toBe("locked");
  });
});

describe("normaliseKeys", () => {
  it("drops blanks, non-positive counts and junk; caps counts", () => {
    expect(normaliseKeys([{ label: " Main door ", count: 2 }, { label: "", count: 1 }, { label: "Gate", count: 0 }, null, { label: "Fob", count: 500 }]))
      .toEqual([{ label: "Main door", count: 2 }, { label: "Fob", count: 99 }]);
    expect(normaliseKeys("nope")).toEqual([]);
  });
});

describe("roomPhotoCounts", () => {
  it("sums photos per room in walkthrough order, ignoring ids with no photo", () => {
    const counts = roomPhotoCounts(
      [item("1", "Kitchen", ["a", "ghost"]), item("2", "Bath", ["b"]), item("3", "Kitchen", ["c"])],
      new Set(["a", "b", "c"]),
    );
    expect(counts).toEqual([{ room: "Kitchen", photos: 2 }, { room: "Bath", photos: 1 }]);
  });
});

describe("submitProblems", () => {
  it("is empty when everything is in place", () => {
    expect(submitProblems(ready())).toEqual([]);
  });
  it(`needs ${MIN_PHOTOS_PER_ROOM} photos in every room`, () => {
    const p = submitProblems(ready({ items: [item("1", "Kitchen", ["p1", "p2"]), item("3", "Bathroom", ["p4", "p5", "p6"])] }));
    expect(p).toEqual([`Kitchen: 2 of ${MIN_PHOTOS_PER_ROOM} photos.`]);
  });
  it("needs every item rated", () => {
    const p = submitProblems(ready({ items: [item("1", "Kitchen", ["p1", "p2", "p3"], null), item("3", "Bathroom", ["p4", "p5", "p6"])] }));
    expect(p).toEqual(["1 item still need a condition."]);
  });
  it("needs a tenant on move-in and move-out but not mid-term", () => {
    expect(submitProblems(ready({ hasTenant: false }))).toContain("A move-in inspection needs a tenant.");
    expect(submitProblems(ready({ reportType: "MID_TERM", hasTenant: false, tenantSignOff: null }))).toEqual([]);
  });
  it("needs a signature and name when the tenant signed", () => {
    expect(submitProblems(ready({ tenantSignaturePath: null, tenantSignedName: " " })))
      .toEqual(["Capture the tenant's signature.", "Type the name of the person who signed."]);
  });
  it("accepts an absent or refusing tenant without a signature", () => {
    expect(submitProblems(ready({ tenantSignOff: "ABSENT", tenantSignaturePath: null, tenantSignedName: null }))).toEqual([]);
    expect(submitProblems(ready({ tenantSignOff: "REFUSED", tenantSignaturePath: null }))).toEqual([]);
  });
  it("needs the sign-off recorded and refuses a second hand-in", () => {
    expect(submitProblems(ready({ tenantSignOff: null }))).toEqual(["Record whether the tenant signed."]);
    expect(submitProblems(ready({ status: "SUBMITTED" }))).toEqual(["This report has already been handed in."]);
  });
});

describe("damagedItems", () => {
  it("picks the items in poor condition", () => {
    expect(damagedItems([item("1", "K", [], "POOR"), item("2", "K", [], "FAIR")]).map((i) => i.id)).toEqual(["1"]);
  });
});

describe("decideInspectionAction", () => {
  const base = { reportType: "MOVE_IN" as const, status: "SUBMITTED" as const, keysClearedAt: null, editRequestedAt: null };
  const mgr = { isManager: true }, care = { isManager: false };

  it("keeps review actions with managers", () => {
    for (const a of ["clear_keys", "send_back", "approve_edit", "decline_edit"] as const) {
      expect(decideInspectionAction(a, base, care, "x")).toMatchObject({ ok: false, status: 403 });
    }
  });
  it("clears move-in keys once, and only on a move-in", () => {
    expect(decideInspectionAction("clear_keys", base, mgr, null)).toEqual({ ok: true });
    expect(decideInspectionAction("clear_keys", { ...base, keysClearedAt: new Date() }, mgr, null)).toMatchObject({ status: 409 });
    expect(decideInspectionAction("clear_keys", { ...base, reportType: "MOVE_OUT" }, mgr, null)).toMatchObject({ status: 400 });
  });
  it("sends back only a submitted report, with a note", () => {
    expect(decideInspectionAction("send_back", base, mgr, "Retake kitchen photos")).toEqual({ ok: true });
    expect(decideInspectionAction("send_back", base, mgr, " ")).toMatchObject({ status: 400 });
    expect(decideInspectionAction("send_back", { ...base, status: "ACCEPTED" }, mgr, "x")).toMatchObject({ status: 409 });
  });
  it("lets a caretaker request a correction once, after hand-in", () => {
    expect(decideInspectionAction("request_edit", { ...base, status: "ACCEPTED" }, care, "Wrong bedroom photo")).toEqual({ ok: true });
    expect(decideInspectionAction("request_edit", { ...base, status: "IN_PROGRESS" }, care, "x")).toMatchObject({ status: 409 });
    expect(decideInspectionAction("request_edit", { ...base, editRequestedAt: new Date() }, care, "x")).toMatchObject({ status: 409 });
  });
  it("approves or declines only a pending request; declining needs a reason", () => {
    const pending = { ...base, status: "ACCEPTED" as const, editRequestedAt: new Date() };
    expect(decideInspectionAction("approve_edit", pending, mgr, null)).toEqual({ ok: true });
    expect(decideInspectionAction("decline_edit", pending, mgr, "")).toMatchObject({ status: 400 });
    expect(decideInspectionAction("approve_edit", base, mgr, null)).toMatchObject({ status: 409 });
  });
});

describe("meter readings on the visit", () => {
  const meters = [
    { meterId: "w", utility: "WATER" as const, label: "Water", lastReading: 176 },
    { meterId: "e", utility: "ELECTRICITY" as const, label: "Electricity", lastReading: null },
  ];
  it("keeps the unit's own meters, snapshots label and last reading, drops junk", () => {
    expect(normaliseMeterReadings([
      { meterId: "w", reading: "179.5" }, { meterId: "x", reading: 3 }, { meterId: "e", reading: "" },
      { meterId: "w", reading: 1 }, { meterId: "e", reading: -2 },
    ], meters)).toEqual([{ meterId: "w", utility: "WATER", label: "Water", reading: 179.5, lastReading: 176 }]);
  });
  it("flags a reading below the last one", () => {
    expect(readingBelowLast({ reading: 170, lastReading: 176 })).toBe(true);
    expect(readingBelowLast({ reading: 170, lastReading: null })).toBe(false);
  });
  it("needs every meter read at move-in and move-out, not mid-term", () => {
    expect(missingMeterReadings("MOVE_IN", meters, [{ meterId: "w" }]).map((m) => m.meterId)).toEqual(["e"]);
    expect(missingMeterReadings("MID_TERM", meters, [])).toEqual([]);
    expect(submitProblems(ready({ meters, meterReadings: [{ meterId: "w" }] }))).toEqual(["Take the Electricity reading."]);
  });
});

describe("post-stay checks", () => {
  const stay = (over: Partial<SubmitInput> = {}): SubmitInput => ready({
    reportType: "POST_STAY",
    hasTenant: false,
    tenantSignOff: null,
    tenantSignedName: null,
    tenantSignaturePath: null,
    items: [item("1", "Living Room", ["p1"]), item("2", "Bathroom", ["p2"])],
    photoIds: new Set(["p1", "p2"]),
    ...over,
  });

  it("needs one photo per room, no tenant, no sign-off and no meter readings", () => {
    expect(minPhotosPerRoom("POST_STAY")).toBe(1);
    expect(minPhotosPerRoom("MOVE_OUT")).toBe(MIN_PHOTOS_PER_ROOM);
    const meters = [{ meterId: "w", utility: "WATER" as const, label: "Water", lastReading: 10 }];
    expect(submitProblems(stay({ meters }))).toEqual([]);
    expect(submitProblems(stay({ items: [item("1", "Living Room", []), item("2", "Bathroom", ["p2"])] }))).toEqual(["Living Room: 0 of 1 photo."]);
  });

  it("wants a note and a photo of its own for anything damaged", () => {
    const damaged = { ...item("1", "Living Room", ["p1"], "POOR"), notes: "" };
    const dmgPhotoElsewhere = stay({ items: [damaged, item("2", "Bathroom", ["p2"])] });
    expect(submitProblems(dmgPhotoElsewhere)).toEqual(["Living Room: say what is damaged."]);
    const noPhoto = stay({ items: [{ ...damaged, notes: "Cracked mirror", photoIds: [] }, item("3", "Living Room", ["p1"]), item("2", "Bathroom", ["p2"])] });
    expect(submitProblems(noPhoto)).toEqual(["Living Room: photograph the damage."]);
  });

  it("rates fine / damaged and labels them that way", () => {
    expect(ratingOptions("POST_STAY")).toEqual([{ value: "GOOD", label: "Fine" }, { value: "POOR", label: "Damaged" }]);
    expect(ratingOptions("MOVE_IN").map((o) => o.value)).toEqual(["PERFECT", "GOOD", "FAIR", "POOR"]);
    expect(itemStatusLabel("POST_STAY", "POOR")).toBe("Damaged");
    expect(itemStatusLabel("POST_STAY", "GOOD")).toBe("Fine");
    expect(itemStatusLabel("MOVE_IN", "FAIR")).toBe("FAIR");
    expect(itemStatusLabel("POST_STAY", null)).toBe("not rated");
  });

  it("seeds one Overall item per room, without duplicates", () => {
    let n = 0;
    const items = postStayItems(["Living Room", " Bathroom ", "Living Room", ""], () => `id${++n}`);
    expect(items.map((i) => [i.room, i.feature, i.status])).toEqual([["Living Room", "Overall", null], ["Bathroom", "Overall", null]]);
  });

  it("has no keys step (the guest's keys are on the stay)", () => {
    expect(keysState({ reportType: "POST_STAY", status: "IN_PROGRESS", keysClearedAt: null })).toBe("none");
  });

  it("is clean only with no damage and nothing reported", () => {
    const fine = [item("1", "Living Room", ["p1"])];
    expect(isCleanPostStay({ reportType: "POST_STAY", items: fine, tenantIssues: null })).toBe(true);
    expect(isCleanPostStay({ reportType: "POST_STAY", items: fine, tenantIssues: "Remote missing" })).toBe(false);
    expect(isCleanPostStay({ reportType: "POST_STAY", items: [item("1", "Living Room", ["p1"], "POOR")], tenantIssues: null })).toBe(false);
    expect(isCleanPostStay({ reportType: "MID_TERM", items: fine, tenantIssues: null })).toBe(false);
  });
});
