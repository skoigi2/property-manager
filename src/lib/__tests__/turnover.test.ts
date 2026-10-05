import { describe, it, expect } from "vitest";
import {
  defaultTurnoverItems, normaliseTurnoverItems, decideTurnoverToggle, setTurnoverItem,
  effectiveTurnoverItems, turnoverProgress, repairCategoryFor, TURNOVER_ITEMS,
} from "@/lib/turnover";

const ctx = (open = 0, total = 0, depositSettled = false, completed = false) => ({ repairs: { open, total }, depositSettled, completed });

describe("re-let checklist items", () => {
  it("starts with every item, pre-ticking what the checkout already did", () => {
    const items = defaultTurnoverItems({ keys: true, deposit: true }, "Amina", new Date("2026-10-06T08:00:00Z"));
    expect(items.map((i) => i.key)).toEqual(TURNOVER_ITEMS.map((t) => t.key));
    expect(items.find((i) => i.key === "keys")).toMatchObject({ done: true, doneByName: "Amina", doneAt: "2026-10-06T08:00:00.000Z" });
    expect(items.find((i) => i.key === "cleaned")).toMatchObject({ done: false, doneAt: null, doneByName: null });
  });

  it("normalises stored JSON back to the full ordered list", () => {
    const items = normaliseTurnoverItems([{ key: "cleaned", done: true, doneAt: "x", doneByName: "Joe" }, { key: "bogus", done: true }]);
    expect(items).toHaveLength(TURNOVER_ITEMS.length);
    expect(items.find((i) => i.key === "cleaned")?.done).toBe(true);
    expect(normaliseTurnoverItems(null).every((i) => !i.done)).toBe(true);
  });

  it("refuses to tick repairs while jobs are open, and any change once complete", () => {
    expect(decideTurnoverToggle("repairs", true, ctx(2, 3))).toMatchObject({ ok: false, status: 409 });
    expect(decideTurnoverToggle("repairs", true, ctx(0, 3))).toEqual({ ok: true });
    expect(decideTurnoverToggle("cleaned", true, ctx(0, 0, false, true))).toMatchObject({ ok: false, status: 409 });
    expect(decideTurnoverToggle("deposit", false, ctx(0, 0, true))).toMatchObject({ ok: false });
  });

  it("follows the records for repairs and the deposit", () => {
    const items = defaultTurnoverItems();
    expect(effectiveTurnoverItems(items, { repairs: { open: 0, total: 2 }, depositSettled: true })
      .filter((i) => i.done).map((i) => i.key)).toEqual(["repairs", "deposit"]);
    // No repair jobs raised: "Repairs done" stays a manual tick.
    expect(effectiveTurnoverItems(items, { repairs: { open: 0, total: 0 }, depositSettled: false }).find((i) => i.key === "repairs")?.done).toBe(false);
  });

  it("is complete when every item is done", () => {
    let items = defaultTurnoverItems();
    for (const t of TURNOVER_ITEMS) items = setTurnoverItem(items, t.key, true, "Joe");
    expect(turnoverProgress(items)).toEqual({ done: TURNOVER_ITEMS.length, total: TURNOVER_ITEMS.length, complete: true });
    expect(turnoverProgress(setTurnoverItem(items, "listed", false, null)).complete).toBe(false);
  });
});

describe("repairCategoryFor", () => {
  it("guesses a category from the feature", () => {
    expect(repairCategoryFor("Sink/Taps")).toBe("PLUMBING");
    expect(repairCategoryFor("Lighting")).toBe("ELECTRICAL");
    expect(repairCategoryFor("Walls")).toBe("PAINTING");
    expect(repairCategoryFor("Front Door")).toBe("STRUCTURAL");
    expect(repairCategoryFor("Furnishings")).toBe("OTHER");
  });
});
