import { describe, it, expect } from "vitest";
import {
  blocksApproval,
  calcConsumption,
  calcReadingCharge,
  canChangeInvoiceUtilities,
  isBillableOnInvoice,
  previousPeriod,
  readingAnomalies,
  readingLineLabel,
  resolveReadingRates,
  resolveTariffForPeriod,
  sumReadingsByUtility,
} from "../utility-billing";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("calcConsumption", () => {
  it("is current minus previous", () => {
    expect(calcConsumption(0, 5)).toBe(5);
    expect(calcConsumption(176, 179)).toBe(3);
  });

  it("does not leak float noise (48.70 − 46.80)", () => {
    expect(calcConsumption(46.8, 48.7)).toBe(1.9);
  });

  it("goes negative when the reading is below the previous one", () => {
    expect(calcConsumption(179, 170)).toBe(-9);
  });
});

describe("calcReadingCharge", () => {
  it("is consumption × rate (5 units at KSh 150)", () => {
    expect(calcReadingCharge(5, 150)).toBe(750);
  });

  it("matches the sample bill lines", () => {
    expect(calcReadingCharge(3, 175)).toBe(525);
    expect(calcReadingCharge(1.9, 350)).toBe(665);
  });

  it("rounds to 2 dp", () => {
    expect(calcReadingCharge(12.345, 23.87)).toBe(294.68);
  });

  it("never charges for zero or negative consumption", () => {
    expect(calcReadingCharge(0, 150)).toBe(0);
    expect(calcReadingCharge(-9, 150)).toBe(0);
  });
});

describe("resolveTariffForPeriod", () => {
  const tariffs = [
    { effectiveFrom: d("2026-01-01"), supplyRate: 150, fuelRate: 0 },
    { effectiveFrom: d("2026-07-01"), supplyRate: 175, fuelRate: 0 },
  ];

  it("carries the latest tariff forward", () => {
    expect(resolveTariffForPeriod(tariffs, 2026, 6)?.supplyRate).toBe(150);
    expect(resolveTariffForPeriod(tariffs, 2026, 7)?.supplyRate).toBe(175);
    expect(resolveTariffForPeriod(tariffs, 2027, 2)?.supplyRate).toBe(175);
  });

  it("applies a tariff dated mid-month to that month's readings", () => {
    const mid = [...tariffs, { effectiveFrom: d("2026-09-15"), supplyRate: 200, fuelRate: 0 }];
    expect(resolveTariffForPeriod(mid, 2026, 9)?.supplyRate).toBe(200);
    expect(resolveTariffForPeriod(mid, 2026, 8)?.supplyRate).toBe(175);
  });

  it("is null before the first tariff starts", () => {
    expect(resolveTariffForPeriod(tariffs, 2025, 12)).toBeNull();
    expect(resolveTariffForPeriod([], 2026, 6)).toBeNull();
  });
});

describe("resolveReadingRates", () => {
  it("adds the fuel rate to the supply rate (electricity)", () => {
    expect(resolveReadingRates({ effectiveFrom: d("2026-01-01"), supplyRate: 23.5, fuelRate: 4.25 })).toEqual({
      supplyRate: 23.5,
      fuelRate: 4.25,
      ratePerUnit: 27.75,
    });
  });

  it("lets a meter override win (hot water)", () => {
    expect(resolveReadingRates({ effectiveFrom: d("2026-01-01"), supplyRate: 175 }, 350)).toEqual({
      supplyRate: 350,
      fuelRate: 0,
      ratePerUnit: 350,
    });
  });

  it("is null with no tariff and no override", () => {
    expect(resolveReadingRates(null)).toBeNull();
    expect(resolveReadingRates(null, null)).toBeNull();
  });
});

describe("readingAnomalies", () => {
  it("blocks a reading below the previous one", () => {
    const a = readingAnomalies({ consumption: -9, occupied: true, history: [4, 5, 6] });
    expect(a.map((x) => x.code)).toEqual(["NEGATIVE"]);
    expect(blocksApproval(a)).toBe(true);
  });

  it("warns on zero consumption for an occupied unit only", () => {
    expect(readingAnomalies({ consumption: 0, occupied: true, history: [] }).map((x) => x.code)).toEqual(["ZERO_OCCUPIED"]);
    expect(readingAnomalies({ consumption: 0, occupied: false, history: [] })).toEqual([]);
  });

  it("warns above 2.5× the trailing average, but never blocks", () => {
    const a = readingAnomalies({ consumption: 14, occupied: true, history: [5, 5, 5, 50] });
    expect(a.map((x) => x.code)).toEqual(["HIGH"]);
    expect(blocksApproval(a)).toBe(false);
    expect(readingAnomalies({ consumption: 12, occupied: true, history: [5, 5, 5] })).toEqual([]);
  });

  it("needs at least two earlier readings before judging 'high'", () => {
    expect(readingAnomalies({ consumption: 500, occupied: true, history: [5] })).toEqual([]);
  });
});

describe("readingLineLabel", () => {
  it("reads like the sample bill", () => {
    expect(
      readingLineLabel({
        periodYear: 2026, periodMonth: 6, label: "Water", unitLabel: "units",
        previousReading: 176, currentReading: 179, consumption: 3, ratePerUnit: 175,
      }),
    ).toBe("Jun 26 Water: 3 units (Prev: 176.00, Curr: 179.00) @ 175.00");
    expect(
      readingLineLabel({
        periodYear: 2026, periodMonth: 6, label: "Hot water", unitLabel: "units",
        previousReading: 46.8, currentReading: 48.7, consumption: 1.9, ratePerUnit: 350,
      }),
    ).toBe("Jun 26 Hot water: 1.9 units (Prev: 46.80, Curr: 48.70) @ 350.00");
  });

  it("omits the rate when none is known", () => {
    expect(
      readingLineLabel({
        periodYear: 2026, periodMonth: 12, label: "Electricity", unitLabel: "kWh",
        previousReading: 1200, currentReading: 1342.5, consumption: 142.5, ratePerUnit: null,
      }),
    ).toBe("Dec 26 Electricity: 142.5 kWh (Prev: 1,200.00, Curr: 1,342.50)");
  });
});

describe("billing period", () => {
  it("bills June's readings on the July invoice, never on June's", () => {
    expect(isBillableOnInvoice({ periodYear: 2026, periodMonth: 6 }, { periodYear: 2026, periodMonth: 7 })).toBe(true);
    expect(isBillableOnInvoice({ periodYear: 2026, periodMonth: 6 }, { periodYear: 2026, periodMonth: 6 })).toBe(false);
    expect(isBillableOnInvoice({ periodYear: 2026, periodMonth: 7 }, { periodYear: 2026, periodMonth: 6 })).toBe(false);
  });

  it("lets older stragglers ride along, across a year end", () => {
    expect(isBillableOnInvoice({ periodYear: 2025, periodMonth: 11 }, { periodYear: 2026, periodMonth: 1 })).toBe(true);
    expect(previousPeriod(2026, 1)).toEqual({ year: 2025, month: 12 });
    expect(previousPeriod(2026, 7)).toEqual({ year: 2026, month: 6 });
  });
});

describe("sumReadingsByUtility", () => {
  it("rolls cold and hot water into one water line", () => {
    expect(
      sumReadingsByUtility([
        { utility: "WATER", amount: 525 },
        { utility: "WATER", amount: 665 },
        { utility: "ELECTRICITY", amount: 1200.5 },
        { utility: "ELECTRICITY", amount: null },
      ]),
    ).toEqual({ waterAmount: 1190, electricityAmount: 1200.5 });
  });
});

describe("canChangeInvoiceUtilities", () => {
  it("allows an untouched draft, sent or overdue invoice", () => {
    for (const status of ["DRAFT", "SENT", "OVERDUE"]) {
      expect(canChangeInvoiceUtilities({ status, paidAmount: null, incomeEntryCount: 0 })).toBe(true);
    }
  });

  it("refuses once money is booked or the invoice is closed", () => {
    expect(canChangeInvoiceUtilities({ status: "SENT", paidAmount: 5000, incomeEntryCount: 0 })).toBe(false);
    expect(canChangeInvoiceUtilities({ status: "SENT", paidAmount: 0, incomeEntryCount: 1 })).toBe(false);
    expect(canChangeInvoiceUtilities({ status: "PAID", paidAmount: 0, incomeEntryCount: 0 })).toBe(false);
    expect(canChangeInvoiceUtilities({ status: "PENDING_VERIFICATION", incomeEntryCount: 0 })).toBe(false);
    expect(canChangeInvoiceUtilities({ status: "CANCELLED", incomeEntryCount: 0 })).toBe(false);
  });
});
