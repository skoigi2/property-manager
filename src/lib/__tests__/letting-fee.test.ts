import { describe, it, expect } from "vitest";
import { calcLettingFee, lettingFeeBase, lettingFeeDescription } from "../letting-fee";

describe("letting fee base", () => {
  it("is rent + service charge + parking", () => {
    expect(lettingFeeBase({ monthlyRent: 22000, serviceCharge: 3000, parkingFee: 1500 })).toBe(26500);
  });

  it("treats missing service charge / parking as zero", () => {
    expect(lettingFeeBase({ monthlyRent: 22000 })).toBe(22000);
    expect(lettingFeeBase({ monthlyRent: 22000, serviceCharge: null, parkingFee: null })).toBe(22000);
  });
});

describe("calcLettingFee", () => {
  it("applies the rate to the full monthly charge, not rent alone (17 Losai)", () => {
    const r = calcLettingFee({ monthlyRent: 22000, serviceCharge: 3000, parkingFee: 0 }, 50);
    expect(r.base).toBe(25000);
    expect(r.amount).toBe(12500);
    expect(r.breakdown).toEqual([
      { label: "Rent", amount: 22000 },
      { label: "Service charge", amount: 3000 },
    ]);
  });

  it("includes parking only when set", () => {
    const r = calcLettingFee({ monthlyRent: 10000, serviceCharge: 0, parkingFee: 2000 }, 100);
    expect(r.amount).toBe(12000);
    expect(r.breakdown.map((b) => b.label)).toEqual(["Rent", "Parking"]);
  });

  it("rounds to 2 dp", () => {
    expect(calcLettingFee({ monthlyRent: 10001 }, 33.3).amount).toBe(3330.33);
  });

  it("describes the calculation with the breakdown", () => {
    const r = calcLettingFee({ monthlyRent: 22000, serviceCharge: 3000 }, 50);
    const fmt = (n: number) => `KES ${n.toLocaleString("en-US")}`;
    expect(lettingFeeDescription(r, fmt)).toBe("50% × KES 25,000 (rent KES 22,000 + service charge KES 3,000)");
    expect(lettingFeeDescription(calcLettingFee({ monthlyRent: 22000 }, 50), fmt)).toBe("50% × KES 22,000");
  });
});
