import { describe, it, expect } from "vitest";
import { getLeaseStatus, daysUntilExpiry, getMonthRange, isInMonth } from "@/lib/date-utils";

const daysFromNow = (d: number) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);

describe("getLeaseStatus", () => {
  it("returns TBC when no lease end is set", () => {
    expect(getLeaseStatus(null)).toBe("TBC");
    expect(getLeaseStatus(undefined)).toBe("TBC");
  });

  it("returns CRITICAL when expired, WARNING within 60 days, OK beyond", () => {
    expect(getLeaseStatus(daysFromNow(-2))).toBe("CRITICAL");
    expect(getLeaseStatus(daysFromNow(30))).toBe("WARNING");
    expect(getLeaseStatus(daysFromNow(90))).toBe("OK");
  });
});

describe("daysUntilExpiry", () => {
  it("returns null without a date and whole days otherwise", () => {
    expect(daysUntilExpiry(null)).toBeNull();
    expect(daysUntilExpiry(daysFromNow(10))).toBe(10);
  });
});

describe("getMonthRange / isInMonth", () => {
  it("spans the first to the last instant of the month", () => {
    const { from, to } = getMonthRange(2024, 2); // Feb 2024 (leap year)
    expect(from.getDate()).toBe(1);
    expect(from.getMonth()).toBe(1);
    expect(to.getDate()).toBe(29);
    expect(to.getMonth()).toBe(1);
  });

  it("isInMonth respects month boundaries", () => {
    expect(isInMonth(new Date(2026, 5, 15), 2026, 6)).toBe(true);
    expect(isInMonth(new Date(2026, 6, 1), 2026, 6)).toBe(false);
  });
});
