import { describe, it, expect } from "vitest";
import { calcPropertyManagementFee } from "../management-fee";

const base = {
  tenants: [
    { unitId: "u1", monthlyRent: 10000 },
    { unitId: "u2", monthlyRent: 20000 },
  ],
  feeConfigs: [],
  grossIncome: 100000,
};

describe("calcPropertyManagementFee", () => {
  it("returns 0 when nothing is configured — no fee is a first-class state", () => {
    expect(calcPropertyManagementFee(base)).toBe(0);
    expect(
      calcPropertyManagementFee({ ...base, propertyRatePercent: null, propertyFlatAmount: null, agreementRatePercent: null }),
    ).toBe(0);
  });

  it("per-unit configs win; unconfigured units carry no fee", () => {
    const fee = calcPropertyManagementFee({
      ...base,
      feeConfigs: [{ unitId: "u1", flatAmount: 6000, ratePercent: 0 }],
      propertyRatePercent: 10, // must be ignored while configs exist
    });
    expect(fee).toBe(6000);
  });

  it("per-unit rate configs apply against the unit's monthly rent", () => {
    const fee = calcPropertyManagementFee({
      ...base,
      feeConfigs: [
        { unitId: "u1", flatAmount: null, ratePercent: 10 }, // 1 000
        { unitId: "u2", flatAmount: 5000, ratePercent: 10 }, // flat wins → 5 000
      ],
    });
    expect(fee).toBe(6000);
  });

  it("scales per-unit and flat fees across a multi-month period", () => {
    expect(
      calcPropertyManagementFee({
        ...base,
        feeConfigs: [{ unitId: "u1", flatAmount: 6000, ratePercent: 0 }],
        monthsMult: 3,
      }),
    ).toBe(18000);
    expect(
      calcPropertyManagementFee({ ...base, propertyFlatAmount: 4000, monthsMult: 3 }),
    ).toBe(12000);
  });

  it("property rate applies to period gross (not scaled again)", () => {
    expect(
      calcPropertyManagementFee({ ...base, propertyRatePercent: 10, monthsMult: 3 }),
    ).toBe(10000);
  });

  it("property rate beats property flat, which beats agreement rate", () => {
    expect(
      calcPropertyManagementFee({
        ...base,
        propertyRatePercent: 10,
        propertyFlatAmount: 999,
        agreementRatePercent: 50,
      }),
    ).toBe(10000);
    expect(
      calcPropertyManagementFee({ ...base, propertyFlatAmount: 999, agreementRatePercent: 50 }),
    ).toBe(999);
    expect(calcPropertyManagementFee({ ...base, agreementRatePercent: 8.5 })).toBe(8500);
  });

  it("zero rates are treated as not configured", () => {
    expect(
      calcPropertyManagementFee({ ...base, propertyRatePercent: 0, agreementRatePercent: 0 }),
    ).toBe(0);
  });
});
