import { describe, it, expect } from "vitest";
import {
  calcLongTerm,
  calcAirbnb,
  solveBreakevenOccupancy,
  compareStrategies,
  interpretBreakeven,
  runStressTests,
  DEFAULT_INPUTS,
  type LongTermInputs,
  type AirbnbInputs,
} from "../rental-calculator";

const LT: LongTermInputs = {
  monthlyRent: 2000,
  vacancyRatePct: 5,
  managementFeePct: 8,
  annualPropertyTaxes: 2400,
  annualInsurance: 1200,
  annualRepairs: 1500,
  annualCapexReserve: 1200,
  annualHoaFees: 600,
  annualOtherExpenses: 300,
};

const AB: AirbnbInputs = {
  nightlyRate: 150,
  occupancyRatePct: 65,
  avgStayNights: 3,
  cleaningCostPerTurnover: 80,
  monthlyUtilities: 200,
  monthlyInternet: 60,
  monthlySupplies: 75,
  platformFeePct: 3,
  lodgingTaxPct: 2,
  managementFeePct: 15,
  annualPropertyTaxes: 2400,
  annualInsurance: 1800,
  annualRepairs: 2000,
  annualFurnishingReserve: 1500,
  annualHoaFees: 600,
  annualOtherExpenses: 300,
};

describe("calcLongTerm", () => {
  it("computes effective gross income net of vacancy", () => {
    const r = calcLongTerm(LT);
    expect(r.effectiveGrossIncome).toBeCloseTo(2000 * 12 * 0.95); // 22,800
  });

  it("computes management cost on effective (not gross) income", () => {
    const r = calcLongTerm(LT);
    expect(r.managementCost).toBeCloseTo(22800 * 0.08); // 1,824
  });

  it("computes annual and monthly NOI", () => {
    const r = calcLongTerm(LT);
    const expenses = 1824 + 2400 + 1200 + 1500 + 1200 + 600 + 300; // 9,024
    expect(r.totalOperatingExpenses).toBeCloseTo(expenses);
    expect(r.annualNoi).toBeCloseTo(22800 - expenses); // 13,776
    expect(r.monthlyNoi).toBeCloseTo((22800 - expenses) / 12);
  });

  it("handles 100% vacancy producing negative NOI", () => {
    const r = calcLongTerm({ ...LT, vacancyRatePct: 100 });
    expect(r.effectiveGrossIncome).toBe(0);
    expect(r.annualNoi).toBeLessThan(0);
  });
});

describe("calcAirbnb", () => {
  it("computes booked nights and gross revenue from occupancy", () => {
    const r = calcAirbnb(AB);
    expect(r.bookedNights).toBeCloseTo(365 * 0.65); // 237.25
    expect(r.grossRevenue).toBeCloseTo(237.25 * 150); // 35,587.50
  });

  it("derives turnovers and cleaning from average stay length", () => {
    const r = calcAirbnb(AB);
    expect(r.turnovers).toBeCloseTo(237.25 / 3);
    expect(r.cleaningCosts).toBeCloseTo((237.25 / 3) * 80);
  });

  it("computes percentage fees on gross revenue", () => {
    const r = calcAirbnb(AB);
    expect(r.platformFees).toBeCloseTo(r.grossRevenue * 0.03);
    expect(r.lodgingTaxes).toBeCloseTo(r.grossRevenue * 0.02);
    expect(r.managementFees).toBeCloseTo(r.grossRevenue * 0.15);
  });

  it("NOI = revenue minus all operating expenses", () => {
    const r = calcAirbnb(AB);
    expect(r.annualNoi).toBeCloseTo(r.grossRevenue - r.totalOperatingExpenses);
    expect(r.monthlyNoi).toBeCloseTo(r.annualNoi / 12);
  });

  it("avoids divide-by-zero when avg stay is 0", () => {
    const r = calcAirbnb({ ...AB, avgStayNights: 0 });
    expect(r.turnovers).toBe(0);
    expect(r.cleaningCosts).toBe(0);
  });
});

describe("solveBreakevenOccupancy", () => {
  it("finds the occupancy where Airbnb NOI equals the target", () => {
    const ltNoi = calcLongTerm(LT).annualNoi;
    const breakeven = solveBreakevenOccupancy(AB, ltNoi);
    expect(breakeven).not.toBeNull();
    // Verify by plugging back in: NOI at breakeven occupancy ≈ LT NOI
    const check = calcAirbnb({ ...AB, occupancyRatePct: breakeven! });
    expect(check.annualNoi).toBeCloseTo(ltNoi, 4);
  });

  it("returns null when target is unreachable even at 100% occupancy", () => {
    const breakeven = solveBreakevenOccupancy({ ...AB, nightlyRate: 30 }, 50000);
    expect(breakeven).toBeNull();
  });

  it("returns null when every booked night loses money", () => {
    const losing = { ...AB, nightlyRate: 10, cleaningCostPerTurnover: 200, avgStayNights: 1 };
    expect(solveBreakevenOccupancy(losing, 1000)).toBeNull();
  });

  it("clamps to 0 when Airbnb is profitable even empty (negative target)", () => {
    const noFixedCosts: AirbnbInputs = {
      ...AB,
      monthlyUtilities: 0, monthlyInternet: 0, monthlySupplies: 0,
      annualPropertyTaxes: 0, annualInsurance: 0, annualRepairs: 0,
      annualFurnishingReserve: 0, annualHoaFees: 0, annualOtherExpenses: 0,
    };
    expect(solveBreakevenOccupancy(noFixedCosts, -5000)).toBe(0);
  });
});

describe("runStressTests", () => {
  it("returns all five scenarios", () => {
    const ltNoi = calcLongTerm(LT).annualNoi;
    const tests = runStressTests(AB, ltNoi);
    expect(tests.map((t) => t.key)).toEqual([
      "occ_down_10", "occ_down_20", "rate_down_10", "cleaning_up_15", "platform_up_2",
    ]);
  });

  it("a 20-point occupancy drop hurts more than a 10-point drop", () => {
    const tests = runStressTests(AB, 0);
    const ten = tests.find((t) => t.key === "occ_down_10")!;
    const twenty = tests.find((t) => t.key === "occ_down_20")!;
    expect(twenty.airbnbAnnualNoi).toBeLessThan(ten.airbnbAnnualNoi);
  });

  it("does not push occupancy below zero", () => {
    const tests = runStressTests({ ...AB, occupancyRatePct: 5 }, 0);
    const twenty = tests.find((t) => t.key === "occ_down_20")!;
    // 0% occupancy → NOI = −fixed costs
    const empty = calcAirbnb({ ...AB, occupancyRatePct: 0 });
    expect(twenty.airbnbAnnualNoi).toBeCloseTo(empty.annualNoi);
  });
});

describe("compareStrategies", () => {
  it("computes the hassle-adjusted advantage", () => {
    const r = compareStrategies({ longTerm: LT, airbnb: AB, hasslePremiumMonthly: 300, currency: "USD" });
    expect(r.hasslePremiumAnnual).toBe(3600);
    expect(r.hassleAdjustedAdvantage).toBeCloseTo(r.annualAdvantage - 3600);
  });

  it("hassle breakeven occupancy is higher than plain breakeven", () => {
    const r = compareStrategies({ longTerm: LT, airbnb: AB, hasslePremiumMonthly: 300, currency: "USD" });
    expect(r.breakevenOccupancyPct).not.toBeNull();
    expect(r.hassleBreakevenOccupancyPct).not.toBeNull();
    expect(r.hassleBreakevenOccupancyPct!).toBeGreaterThan(r.breakevenOccupancyPct!);
  });

  it("verdict is LONG_TERM_WINS when Airbnb underperforms after the premium", () => {
    const weakAirbnb = { ...AB, occupancyRatePct: 30 };
    const r = compareStrategies({ longTerm: LT, airbnb: weakAirbnb, hasslePremiumMonthly: 300, currency: "USD" });
    expect(r.verdict).toBe("LONG_TERM_WINS");
  });

  it("verdict is AIRBNB_WINS with a strong occupancy edge", () => {
    const strongAirbnb = { ...AB, occupancyRatePct: 90, nightlyRate: 250 };
    const r = compareStrategies({ longTerm: LT, airbnb: strongAirbnb, hasslePremiumMonthly: 300, currency: "USD" });
    expect(r.verdict).toBe("AIRBNB_WINS");
  });

  it("default inputs produce a finite, sane result", () => {
    const r = compareStrategies(DEFAULT_INPUTS);
    expect(Number.isFinite(r.longTerm.annualNoi)).toBe(true);
    expect(Number.isFinite(r.airbnb.annualNoi)).toBe(true);
    expect(r.stressTests).toHaveLength(5);
  });
});

describe("interpretBreakeven", () => {
  it("maps bands per spec", () => {
    expect(interpretBreakeven(35).band).toBe("STRONG_AIRBNB");
    expect(interpretBreakeven(50).band).toBe("EITHER");
    expect(interpretBreakeven(65).band).toBe("EXECUTION_DEPENDENT");
    expect(interpretBreakeven(80).band).toBe("LONG_TERM_FAVOURED");
    expect(interpretBreakeven(null).band).toBe("UNREACHABLE");
  });
});
