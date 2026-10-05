import { describe, it, expect } from "vitest";
import { checkoutPrefillFromInspection } from "@/lib/inspection-checkout";

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
