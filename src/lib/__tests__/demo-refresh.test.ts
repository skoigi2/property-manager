import { describe, it, expect } from "vitest";
import { isSampleStale, describeAddedSinceSeed, refreshDismissKey } from "../demo-refresh";

const d = (s: string) => new Date(`${s}T12:00:00`);

describe("isSampleStale", () => {
  it("is fresh within the month it was loaded in", () => {
    expect(isSampleStale(d("2026-10-01"), d("2026-10-31"))).toBe(false);
  });
  it("goes stale once that month has passed", () => {
    expect(isSampleStale(d("2026-09-30"), d("2026-10-01"))).toBe(true);
    expect(isSampleStale(d("2026-05-31"), d("2026-10-01"))).toBe(true);
  });
  it("handles the year boundary", () => {
    expect(isSampleStale(d("2025-12-15"), d("2026-01-02"))).toBe(true);
    expect(isSampleStale(d("2026-01-01"), d("2026-01-31"))).toBe(false);
  });
  it("accepts an ISO string", () => {
    expect(isSampleStale("2026-08-04T10:00:00.000Z", d("2026-10-01"))).toBe(true);
  });
});

describe("describeAddedSinceSeed", () => {
  it("is null when nothing was added", () => {
    expect(describeAddedSinceSeed({ tenants: 0, payments: 0, expenses: 0, maintenanceJobs: 0 })).toBeNull();
  });
  it("lists what was added in plain words", () => {
    expect(describeAddedSinceSeed({ tenants: 1, payments: 0, expenses: 0, maintenanceJobs: 0 })).toBe("1 tenant");
    expect(describeAddedSinceSeed({ tenants: 1, payments: 3, expenses: 2, maintenanceJobs: 0 })).toBe("1 tenant, 3 payments and 2 expenses");
  });
});

describe("refreshDismissKey", () => {
  it("is per property and month", () => {
    expect(refreshDismissKey("p1", d("2026-10-05"))).toBe("sample-refresh-dismissed:p1:2026-10");
  });
});
