import { describe, it, expect } from "vitest";
import { checkoutPrefillFromInspection, damageExpenseFor } from "@/lib/inspection-checkout";

const item = (room: string, feature: string, status: string | null, notes = "") => ({ id: `${room}-${feature}`, room, feature, status, notes, photoIds: [] });

describe("checkoutPrefillFromInspection", () => {
  it("describes poor and fair items, flags damage only for POOR", () => {
    const p = checkoutPrefillFromInspection({
      items: [item("Kitchen", "Sink/Taps", "POOR", "dripping"), item("Bedroom", "Walls", "FAIR"), item("Bathroom", "Tiles", "GOOD")],
      keys: [], meterReadings: [],
    });
    expect(p.damageFound).toBe(true);
    expect(p.damagedCount).toBe(2);
    expect(p.damageNotes).toBe("Kitchen — Sink/Taps (POOR): dripping\nBedroom — Walls (FAIR)");
    expect(checkoutPrefillFromInspection({ items: [item("Bedroom", "Walls", "FAIR")], keys: [], meterReadings: [] }).damageFound).toBe(false);
  });

  it("maps keys onto the checkout boxes and lists the rest", () => {
    const p = checkoutPrefillFromInspection({
      items: [],
      keys: [{ label: "Main door", count: 2 }, { label: "Gate", count: 1 }, { label: "Remote / fob", count: 1 }, { label: "bedroom", count: 3 }],
      meterReadings: [],
    });
    expect(p.keysReturned).toEqual({ mainDoor: 2, bedroom: 3, gate: 1, mailbox: 0 });
    expect(p.otherKeys).toEqual(["Remote / fob × 1"]);
  });

  it("passes the final meter readings through and ignores junk", () => {
    const p = checkoutPrefillFromInspection({
      items: null, keys: null,
      meterReadings: [{ meterId: "w", reading: 182.5, label: "Water" }, { meterId: "e" }, null],
    });
    expect(p.finalMeterReadings).toEqual([{ meterId: "w", reading: 182.5 }]);
    expect(p.damageNotes).toBe("");
  });
});

describe("damageExpenseFor", () => {
  it("books the whole damage charge when no repair job was raised", () => {
    expect(damageExpenseFor(30_000, [])).toEqual({ amount: 30_000, coveredByRepairJobs: 0, unquotedRepairJobs: 0 });
  });
  it("books only what the accepted quotes don't cover", () => {
    expect(damageExpenseFor(30_000, [{ acceptedQuote: 12_000 }, { acceptedQuote: 8_000 }]).amount).toBe(10_000);
    expect(damageExpenseFor(15_000, [{ acceptedQuote: 20_000 }]).amount).toBe(0);
  });
  it("books nothing while a repair job has no accepted quote (its cost is unknown)", () => {
    expect(damageExpenseFor(30_000, [{ acceptedQuote: 12_000 }, { acceptedQuote: null }])).toEqual({ amount: 0, coveredByRepairJobs: 12_000, unquotedRepairJobs: 1 });
  });
});
