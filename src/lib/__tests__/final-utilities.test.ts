import { describe, it, expect } from "vitest";
import { depositCoverForUtilities, finalUtilitiesCharge, meterTakesFinalReading, type FinalMeter, type UnbilledReading } from "../final-utilities";

function meter(p: Partial<FinalMeter> & { meterId: string }): FinalMeter {
  return {
    utility: "WATER",
    label: "Water",
    meterNumber: null,
    unitLabel: "units",
    previousReading: 100,
    ratePerUnit: 150,
    periodReading: null,
    locked: false,
    ...p,
  };
}

const WATER = meter({ meterId: "w" });
const POWER = meter({ meterId: "e", utility: "ELECTRICITY", label: "Electricity", unitLabel: "kWh", previousReading: 2000, ratePerUnit: 32 });

describe("finalUtilitiesCharge", () => {
  it("charges the use since the last reading at the month's rate", () => {
    const c = finalUtilitiesCharge([WATER, POWER], [{ meterId: "w", reading: 104 }, { meterId: "e", reading: 2050 }], []);
    expect(c.lines.map((l) => [l.meterId, l.consumption, l.amount])).toEqual([["w", 4, 600], ["e", 50, 1600]]);
    expect(c).toMatchObject({ water: 600, electricity: 1600, total: 2200, missing: [], errors: [] });
  });

  it("adds the tenant's earlier unbilled readings", () => {
    const earlier: UnbilledReading = {
      readingId: "r1", meterId: "w", utility: "WATER", label: "Water", periodYear: 2026, periodMonth: 8,
      consumption: 5, status: "SUBMITTED", amount: 750,
    };
    const c = finalUtilitiesCharge([WATER], [{ meterId: "w", reading: 102 }], [earlier]);
    expect(c.total).toBe(1050);
    expect(c.lines.map((l) => l.kind)).toEqual(["FINAL", "EARLIER"]);
  });

  it("lists meters still missing a reading instead of charging nothing silently", () => {
    const c = finalUtilitiesCharge([WATER, POWER], [{ meterId: "w", reading: 101 }], []);
    expect(c.missing).toEqual(["Electricity"]);
    expect(c.total).toBe(150);
  });

  it("refuses a final reading below the previous one, or a month without a rate", () => {
    expect(finalUtilitiesCharge([WATER], [{ meterId: "w", reading: 90 }], []).errors[0].error).toMatch(/below the previous/);
    expect(finalUtilitiesCharge([meter({ meterId: "w", ratePerUnit: null })], [{ meterId: "w", reading: 101 }], []).errors[0].error).toMatch(/no water rate/);
  });

  it("uses this month's own unbilled reading as the final one unless a new number is typed", () => {
    const m = meter({ meterId: "w", periodReading: { id: "p", currentReading: 103, editable: true, billed: false } });
    expect(finalUtilitiesCharge([m], [], []).lines[0]).toMatchObject({ currentReading: 103, amount: 450 });
    expect(finalUtilitiesCharge([m], [{ meterId: "w", reading: 105 }], []).lines[0]).toMatchObject({ currentReading: 105, amount: 750 });
  });

  it("skips a meter whose month is already billed or locked", () => {
    const billed = meter({ meterId: "w", periodReading: { id: "p", currentReading: 103, editable: false, billed: true } });
    const locked = meter({ meterId: "x", locked: true });
    expect(meterTakesFinalReading(billed)).toBe(false);
    expect(meterTakesFinalReading(locked)).toBe(false);
    expect(finalUtilitiesCharge([billed, locked], [], [])).toMatchObject({ total: 0, missing: [], errors: [] });
  });
});

describe("depositCoverForUtilities", () => {
  it("pays from what is left of the deposit, never more than the bill or below zero", () => {
    expect(depositCoverForUtilities(5000, 2200)).toBe(2200);
    expect(depositCoverForUtilities(1000, 2200)).toBe(1000);
    expect(depositCoverForUtilities(-300, 2200)).toBe(0);
  });
});
