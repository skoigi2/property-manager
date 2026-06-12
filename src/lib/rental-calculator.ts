/**
 * Airbnb vs Long-Term Rental calculator engine.
 *
 * Pure functions only — shared by the marketing calculator UI (client-side)
 * and the emailed PDF investor report (server-side), so both always agree.
 *
 * Convention: every *Pct field is expressed as 0–100 (user-facing), not 0–1.
 */

// ─── Inputs ───────────────────────────────────────────────────────────────────

export interface LongTermInputs {
  monthlyRent: number;
  vacancyRatePct: number;
  managementFeePct: number;
  annualPropertyTaxes: number;
  annualInsurance: number;
  annualRepairs: number;
  annualCapexReserve: number;
  annualHoaFees: number;
  annualOtherExpenses: number;
}

export interface AirbnbInputs {
  nightlyRate: number;
  occupancyRatePct: number;
  avgStayNights: number;
  cleaningCostPerTurnover: number;
  monthlyUtilities: number;
  monthlyInternet: number;
  monthlySupplies: number;
  platformFeePct: number;
  lodgingTaxPct: number;
  managementFeePct: number;
  annualPropertyTaxes: number;
  annualInsurance: number;
  annualRepairs: number;
  annualFurnishingReserve: number;
  annualHoaFees: number;
  annualOtherExpenses: number;
}

export interface CalculatorInputs {
  longTerm: LongTermInputs;
  airbnb: AirbnbInputs;
  /** Extra monthly profit Airbnb must produce before the effort feels worthwhile. */
  hasslePremiumMonthly: number;
  currency: string;
}

// ─── Results ──────────────────────────────────────────────────────────────────

export interface LongTermResult {
  effectiveGrossIncome: number;
  managementCost: number;
  totalOperatingExpenses: number;
  annualNoi: number;
  monthlyNoi: number;
}

export interface AirbnbResult {
  bookedNights: number;
  grossRevenue: number;
  turnovers: number;
  cleaningCosts: number;
  platformFees: number;
  lodgingTaxes: number;
  managementFees: number;
  fixedAnnualCosts: number;
  totalOperatingExpenses: number;
  annualNoi: number;
  monthlyNoi: number;
}

export type RecommendationVerdict = "LONG_TERM_WINS" | "AIRBNB_WINS" | "TOO_CLOSE";

export interface StressScenario {
  key: string;
  label: string;
  airbnbAnnualNoi: number;
  /** Adjusted Airbnb NOI minus long-term NOI (annual). Negative = Airbnb loses. */
  diffVsLongTerm: number;
}

export interface ComparisonResult {
  longTerm: LongTermResult;
  airbnb: AirbnbResult;
  /** Airbnb annual NOI minus long-term annual NOI, before the hassle premium. */
  annualAdvantage: number;
  hasslePremiumAnnual: number;
  /** annualAdvantage minus the hassle premium. */
  hassleAdjustedAdvantage: number;
  /** Occupancy % (0–100) where Airbnb NOI equals long-term NOI. Null when Airbnb can never catch up. */
  breakevenOccupancyPct: number | null;
  /** Breakeven occupancy including the hassle premium on top of long-term NOI. */
  hassleBreakevenOccupancyPct: number | null;
  verdict: RecommendationVerdict;
  stressTests: StressScenario[];
}

// ─── Long-term rental ─────────────────────────────────────────────────────────

export function calcLongTerm(i: LongTermInputs): LongTermResult {
  const effectiveGrossIncome = i.monthlyRent * 12 * (1 - i.vacancyRatePct / 100);
  const managementCost = effectiveGrossIncome * (i.managementFeePct / 100);
  const totalOperatingExpenses =
    managementCost +
    i.annualPropertyTaxes +
    i.annualInsurance +
    i.annualRepairs +
    i.annualCapexReserve +
    i.annualHoaFees +
    i.annualOtherExpenses;
  const annualNoi = effectiveGrossIncome - totalOperatingExpenses;
  return {
    effectiveGrossIncome,
    managementCost,
    totalOperatingExpenses,
    annualNoi,
    monthlyNoi: annualNoi / 12,
  };
}

// ─── Airbnb ───────────────────────────────────────────────────────────────────

function airbnbFixedAnnualCosts(i: AirbnbInputs): number {
  return (
    (i.monthlyUtilities + i.monthlyInternet + i.monthlySupplies) * 12 +
    i.annualPropertyTaxes +
    i.annualInsurance +
    i.annualRepairs +
    i.annualFurnishingReserve +
    i.annualHoaFees +
    i.annualOtherExpenses
  );
}

export function calcAirbnb(i: AirbnbInputs): AirbnbResult {
  const occupancy = i.occupancyRatePct / 100;
  const bookedNights = 365 * occupancy;
  const grossRevenue = bookedNights * i.nightlyRate;
  const turnovers = i.avgStayNights > 0 ? bookedNights / i.avgStayNights : 0;
  const cleaningCosts = turnovers * i.cleaningCostPerTurnover;
  const platformFees = grossRevenue * (i.platformFeePct / 100);
  const lodgingTaxes = grossRevenue * (i.lodgingTaxPct / 100);
  const managementFees = grossRevenue * (i.managementFeePct / 100);
  const fixedAnnualCosts = airbnbFixedAnnualCosts(i);
  const totalOperatingExpenses =
    cleaningCosts + platformFees + lodgingTaxes + managementFees + fixedAnnualCosts;
  const annualNoi = grossRevenue - totalOperatingExpenses;
  return {
    bookedNights,
    grossRevenue,
    turnovers,
    cleaningCosts,
    platformFees,
    lodgingTaxes,
    managementFees,
    fixedAnnualCosts,
    totalOperatingExpenses,
    annualNoi,
    monthlyNoi: annualNoi / 12,
  };
}

// ─── Breakeven occupancy ──────────────────────────────────────────────────────
//
// Airbnb NOI is linear in occupancy:
//   NOI(occ) = occ × marginPerFullOccupancy − fixedAnnualCosts
// where marginPerFullOccupancy is the contribution margin at 100% occupancy
// (revenue net of the per-booked-night variable costs: platform/lodging/mgmt
// percentages and per-turnover cleaning). Solving NOI(occ) = target:

export function solveBreakevenOccupancy(
  airbnb: AirbnbInputs,
  targetAnnualNoi: number
): number | null {
  const variablePctOfRevenue =
    (airbnb.platformFeePct + airbnb.lodgingTaxPct + airbnb.managementFeePct) / 100;
  const cleaningPerNight =
    airbnb.avgStayNights > 0 ? airbnb.cleaningCostPerTurnover / airbnb.avgStayNights : 0;
  const marginPerFullOccupancy =
    365 * (airbnb.nightlyRate * (1 - variablePctOfRevenue) - cleaningPerNight);

  if (marginPerFullOccupancy <= 0) return null; // every booked night loses money

  const occ = (targetAnnualNoi + airbnbFixedAnnualCosts(airbnb)) / marginPerFullOccupancy;
  if (occ > 1) return null; // unreachable even at 100% occupancy
  return Math.max(0, occ) * 100;
}

// ─── Stress tests ─────────────────────────────────────────────────────────────

export function runStressTests(
  airbnb: AirbnbInputs,
  longTermAnnualNoi: number
): StressScenario[] {
  const scenarios: { key: string; label: string; mutate: (a: AirbnbInputs) => AirbnbInputs }[] = [
    {
      key: "occ_down_10",
      label: "Occupancy falls by 10 points",
      mutate: (a) => ({ ...a, occupancyRatePct: Math.max(0, a.occupancyRatePct - 10) }),
    },
    {
      key: "occ_down_20",
      label: "Occupancy falls by 20 points",
      mutate: (a) => ({ ...a, occupancyRatePct: Math.max(0, a.occupancyRatePct - 20) }),
    },
    {
      key: "rate_down_10",
      label: "Nightly rates decline by 10%",
      mutate: (a) => ({ ...a, nightlyRate: a.nightlyRate * 0.9 }),
    },
    {
      key: "cleaning_up_15",
      label: "Cleaning costs increase by 15%",
      mutate: (a) => ({ ...a, cleaningCostPerTurnover: a.cleaningCostPerTurnover * 1.15 }),
    },
    {
      key: "platform_up_2",
      label: "Platform fees increase by 2 points",
      mutate: (a) => ({ ...a, platformFeePct: a.platformFeePct + 2 }),
    },
  ];

  return scenarios.map(({ key, label, mutate }) => {
    const adjusted = calcAirbnb(mutate(airbnb));
    return {
      key,
      label,
      airbnbAnnualNoi: adjusted.annualNoi,
      diffVsLongTerm: adjusted.annualNoi - longTermAnnualNoi,
    };
  });
}

// ─── Recommendation ───────────────────────────────────────────────────────────

function decideVerdict(
  hassleAdjustedAdvantage: number,
  longTerm: LongTermResult,
  airbnb: AirbnbResult
): RecommendationVerdict {
  if (hassleAdjustedAdvantage <= 0) return "LONG_TERM_WINS";
  // "Too close" band: the hassle-adjusted edge is under 5% of the bigger
  // gross income base, so a modest occupancy dip would erase it.
  const base = Math.max(
    Math.abs(longTerm.effectiveGrossIncome),
    Math.abs(airbnb.grossRevenue),
    1
  );
  if (hassleAdjustedAdvantage < 0.05 * base) return "TOO_CLOSE";
  return "AIRBNB_WINS";
}

// ─── Breakeven interpretation ────────────────────────────────────────────────

export interface BreakevenInterpretation {
  band: "STRONG_AIRBNB" | "EITHER" | "EXECUTION_DEPENDENT" | "LONG_TERM_FAVOURED" | "UNREACHABLE";
  headline: string;
}

export function interpretBreakeven(breakevenPct: number | null): BreakevenInterpretation {
  if (breakevenPct === null) {
    return {
      band: "UNREACHABLE",
      headline: "Airbnb cannot match long-term renting at any occupancy level with these assumptions.",
    };
  }
  if (breakevenPct < 40) {
    return { band: "STRONG_AIRBNB", headline: "Airbnb has a strong advantage." };
  }
  if (breakevenPct <= 60) {
    return {
      band: "EITHER",
      headline: "Either strategy could work depending on your management preference.",
    };
  }
  if (breakevenPct <= 70) {
    return {
      band: "EXECUTION_DEPENDENT",
      headline: "Airbnb requires strong execution and consistent demand.",
    };
  }
  return {
    band: "LONG_TERM_FAVOURED",
    headline: "Long-term renting may offer a better risk-adjusted return.",
  };
}

// ─── Full comparison ──────────────────────────────────────────────────────────

export function compareStrategies(inputs: CalculatorInputs): ComparisonResult {
  const longTerm = calcLongTerm(inputs.longTerm);
  const airbnb = calcAirbnb(inputs.airbnb);
  const annualAdvantage = airbnb.annualNoi - longTerm.annualNoi;
  const hasslePremiumAnnual = inputs.hasslePremiumMonthly * 12;
  const hassleAdjustedAdvantage = annualAdvantage - hasslePremiumAnnual;

  return {
    longTerm,
    airbnb,
    annualAdvantage,
    hasslePremiumAnnual,
    hassleAdjustedAdvantage,
    breakevenOccupancyPct: solveBreakevenOccupancy(inputs.airbnb, longTerm.annualNoi),
    hassleBreakevenOccupancyPct: solveBreakevenOccupancy(
      inputs.airbnb,
      longTerm.annualNoi + hasslePremiumAnnual
    ),
    verdict: decideVerdict(hassleAdjustedAdvantage, longTerm, airbnb),
    stressTests: runStressTests(inputs.airbnb, longTerm.annualNoi),
  };
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_LONG_TERM: LongTermInputs = {
  monthlyRent: 2000,
  vacancyRatePct: 5,
  managementFeePct: 8,
  annualPropertyTaxes: 2400,
  annualInsurance: 1200,
  annualRepairs: 1500,
  annualCapexReserve: 1200,
  annualHoaFees: 0,
  annualOtherExpenses: 0,
};

export const DEFAULT_AIRBNB: AirbnbInputs = {
  nightlyRate: 150,
  occupancyRatePct: 65,
  avgStayNights: 3,
  cleaningCostPerTurnover: 80,
  monthlyUtilities: 200,
  monthlyInternet: 60,
  monthlySupplies: 75,
  platformFeePct: 3,
  lodgingTaxPct: 0,
  managementFeePct: 15,
  annualPropertyTaxes: 2400,
  annualInsurance: 1800,
  annualRepairs: 2000,
  annualFurnishingReserve: 1500,
  annualHoaFees: 0,
  annualOtherExpenses: 0,
};

export const DEFAULT_INPUTS: CalculatorInputs = {
  longTerm: DEFAULT_LONG_TERM,
  airbnb: DEFAULT_AIRBNB,
  hasslePremiumMonthly: 300,
  currency: "USD",
};
