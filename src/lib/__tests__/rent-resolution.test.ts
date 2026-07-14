import { describe, it, expect } from "vitest";
import { resolveExpectedRent, resolveExpectedRentForRange } from "../rent-resolution";

const d = (s: string) => new Date(s);

describe("resolveExpectedRent", () => {
  it("falls back to current rent when there is no history", () => {
    expect(resolveExpectedRent([], 60000, d("2025-06-01"))).toBe(60000);
    expect(resolveExpectedRent(null, 60000, d("2025-06-01"))).toBe(60000);
    expect(resolveExpectedRent(undefined, 60000, d("2025-06-01"))).toBe(60000);
  });

  it("uses the latest row effective on or before the month", () => {
    const history = [
      { monthlyRent: 50000, effectiveDate: d("2024-01-01") },
      { monthlyRent: 55000, effectiveDate: d("2025-01-01") },
      { monthlyRent: 60000, effectiveDate: d("2026-01-01") },
    ];
    expect(resolveExpectedRent(history, 60000, d("2024-06-01"))).toBe(50000);
    expect(resolveExpectedRent(history, 60000, d("2025-06-01"))).toBe(55000);
    expect(resolveExpectedRent(history, 60000, d("2026-06-01"))).toBe(60000);
  });

  it("applies a mid-month change to that month", () => {
    const history = [
      { monthlyRent: 50000, effectiveDate: d("2024-01-01") },
      { monthlyRent: 55000, effectiveDate: d("2025-03-15") },
    ];
    // Change on 15 March applies to March itself
    expect(resolveExpectedRent(history, 55000, d("2025-03-01"))).toBe(55000);
    // February still uses the old rate
    expect(resolveExpectedRent(history, 55000, d("2025-02-01"))).toBe(50000);
  });

  it("does not require history to be sorted", () => {
    const history = [
      { monthlyRent: 60000, effectiveDate: d("2026-01-01") },
      { monthlyRent: 50000, effectiveDate: d("2024-01-01") },
      { monthlyRent: 55000, effectiveDate: d("2025-01-01") },
    ];
    expect(resolveExpectedRent(history, 60000, d("2025-06-01"))).toBe(55000);
  });

  it("accepts ISO-string effective dates (API payloads)", () => {
    const history = [
      { monthlyRent: 50000, effectiveDate: "2024-01-01T00:00:00.000Z" },
      { monthlyRent: 55000, effectiveDate: "2025-01-01T00:00:00.000Z" },
    ];
    expect(resolveExpectedRent(history, 55000, d("2024-06-01"))).toBe(50000);
  });

  it("falls back to current rent for months before the first row", () => {
    const history = [{ monthlyRent: 60000, effectiveDate: d("2026-01-01") }];
    expect(resolveExpectedRent(history, 60000, d("2025-06-01"))).toBe(60000);
  });

  it("row effective on the last day of a month applies to that month", () => {
    const history = [
      { monthlyRent: 50000, effectiveDate: d("2024-01-01") },
      { monthlyRent: 55000, effectiveDate: d("2025-01-31") },
    ];
    expect(resolveExpectedRent(history, 55000, d("2025-01-01"))).toBe(55000);
    expect(resolveExpectedRent(history, 55000, d("2024-12-01"))).toBe(50000);
  });
});

describe("resolveExpectedRentForRange", () => {
  it("sums per-month resolved rents across the range", () => {
    const history = [
      { monthlyRent: 50000, effectiveDate: d("2024-01-01") },
      { monthlyRent: 55000, effectiveDate: d("2025-02-01") },
    ];
    // Q1 2025 = Jan @50k + Feb @55k + Mar @55k
    expect(resolveExpectedRentForRange(history, 55000, d("2025-01-01"), 3)).toBe(160000);
  });

  it("matches flat multiplication when there is no history", () => {
    expect(resolveExpectedRentForRange([], 60000, d("2025-01-01"), 3)).toBe(180000);
  });
});
