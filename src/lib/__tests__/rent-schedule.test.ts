import { describe, it, expect } from "vitest";
import { frequencyMonths, scheduledExpectedForMonth } from "../rent-schedule";

const flat = (rent: number) => () => rent;

describe("frequencyMonths", () => {
  it("maps cadences and defaults to monthly", () => {
    expect(frequencyMonths("MONTHLY")).toBe(1);
    expect(frequencyMonths("QUARTERLY")).toBe(3);
    expect(frequencyMonths("BIANNUAL")).toBe(6);
    expect(frequencyMonths("ANNUAL")).toBe(12);
    expect(frequencyMonths(null)).toBe(1);
    expect(frequencyMonths(undefined)).toBe(1);
    expect(frequencyMonths("UNKNOWN")).toBe(1);
  });
});

describe("scheduledExpectedForMonth", () => {
  const leaseStart = new Date("2026-01-15"); // anchors billing to Jan, Apr, Jul, Oct

  it("monthly tenants owe every month", () => {
    const r = scheduledExpectedForMonth({
      leaseStart, frequency: "MONTHLY", month: new Date("2026-05-01"), rentForMonth: flat(350000),
    });
    expect(r).toEqual({ due: true, amount: 350000 });
  });

  it("quarterly tenants owe 3x rent on billing months only", () => {
    const jul = scheduledExpectedForMonth({
      leaseStart, frequency: "QUARTERLY", month: new Date("2026-07-01"), rentForMonth: flat(350000),
    });
    expect(jul).toEqual({ due: true, amount: 1050000 });

    const aug = scheduledExpectedForMonth({
      leaseStart, frequency: "QUARTERLY", month: new Date("2026-08-01"), rentForMonth: flat(350000),
    });
    expect(aug).toEqual({ due: false, amount: 0 });
  });

  it("annual tenants owe 12x rent once a year", () => {
    const anniversary = scheduledExpectedForMonth({
      leaseStart, frequency: "ANNUAL", month: new Date("2027-01-01"), rentForMonth: flat(100000),
    });
    expect(anniversary).toEqual({ due: true, amount: 1200000 });

    const offMonth = scheduledExpectedForMonth({
      leaseStart, frequency: "ANNUAL", month: new Date("2027-02-01"), rentForMonth: flat(100000),
    });
    expect(offMonth.due).toBe(false);
  });

  it("sums escalating rent across the covered months", () => {
    // Rent escalates from 300k to 350k in Aug — the Jul quarter bill covers both rates
    const rentForMonth = (m: Date) =>
      m.getFullYear() > 2026 || (m.getFullYear() === 2026 && m.getMonth() >= 7) ? 350000 : 300000;
    const r = scheduledExpectedForMonth({
      leaseStart, frequency: "QUARTERLY", month: new Date("2026-07-01"), rentForMonth,
    });
    expect(r).toEqual({ due: true, amount: 300000 + 350000 + 350000 });
  });

  it("nothing due before lease start", () => {
    const r = scheduledExpectedForMonth({
      leaseStart, frequency: "QUARTERLY", month: new Date("2025-10-01"), rentForMonth: flat(350000),
    });
    expect(r).toEqual({ due: false, amount: 0 });
  });

  it("accepts ISO-string lease start (API payloads)", () => {
    const r = scheduledExpectedForMonth({
      leaseStart: "2026-01-15T00:00:00.000Z", frequency: "QUARTERLY",
      month: new Date("2026-04-01"), rentForMonth: flat(350000),
    });
    expect(r.due).toBe(true);
  });
});
