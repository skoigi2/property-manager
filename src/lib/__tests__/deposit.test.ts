import { describe, it, expect } from "vitest";
import { calcDepositPosition } from "../deposit";

const entry = (grossAmount: number) => ({ grossAmount });

describe("calcDepositPosition", () => {
  it("falls back to the contractual amount when no receipts exist (UNVERIFIED)", () => {
    const p = calcDepositPosition(50000, []);
    expect(p).toEqual({
      contractual: 50000,
      received: null,
      held: 50000,
      shortfall: 0,
      excess: 0,
      verification: "UNVERIFIED",
    });
  });

  it("uses receipts as the held amount when a trail exists", () => {
    const p = calcDepositPosition(50000, [entry(50000)]);
    expect(p.received).toBe(50000);
    expect(p.held).toBe(50000);
    expect(p.shortfall).toBe(0);
    expect(p.excess).toBe(0);
    expect(p.verification).toBe("VERIFIED");
  });

  it("surfaces a shortfall for a partial deposit", () => {
    const p = calcDepositPosition(50000, [entry(20000)]);
    expect(p.held).toBe(20000);
    expect(p.shortfall).toBe(30000);
    expect(p.excess).toBe(0);
  });

  it("sums instalment deposits", () => {
    const p = calcDepositPosition(60000, [entry(20000), entry(20000), entry(15000)]);
    expect(p.received).toBe(55000);
    expect(p.held).toBe(55000);
    expect(p.shortfall).toBe(5000);
  });

  it("reports excess when more was received than contracted", () => {
    const p = calcDepositPosition(30000, [entry(45000)]);
    expect(p.held).toBe(45000);
    expect(p.shortfall).toBe(0);
    expect(p.excess).toBe(15000);
  });

  it("handles a zero contractual deposit with receipts", () => {
    const p = calcDepositPosition(0, [entry(10000)]);
    expect(p.held).toBe(10000);
    expect(p.excess).toBe(10000);
    expect(p.verification).toBe("VERIFIED");
  });

  it("treats a zero-amount receipt as a trail (VERIFIED, full shortfall)", () => {
    const p = calcDepositPosition(50000, [entry(0)]);
    expect(p.received).toBe(0);
    expect(p.held).toBe(0);
    expect(p.shortfall).toBe(50000);
    expect(p.verification).toBe("VERIFIED");
  });
});
