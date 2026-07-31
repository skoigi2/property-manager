// Derived management fee — the single precedence chain for every surface
// that reports or bills a management fee (owner statements, report P&L,
// owner-invoice generation; the forecast applies the agreement rate itself).
//
// Precedence, most specific first:
//   1. Per-unit ManagementFeeConfig rows — flat amount, else ratePercent ×
//      the unit tenant's monthly rent. Units without a config carry NO fee
//      (mirrors owner-invoice generation).
//   2. Property.managementFeeRate (%) × gross income for the period.
//   3. Property.managementFeeFlat — flat amount per month.
//   4. ManagementAgreement.managementFeeRate (%) × gross income.
//   5. Nothing configured → 0. "No management fee" is a first-class state:
//      no surface may invent a fee from hardcoded legacy constants.

export interface FeeConfigLike {
  unitId: string;
  flatAmount: number | null;
  ratePercent: number;
}

export interface FeeTenantLike {
  unitId: string;
  monthlyRent: number | null;
}

export function calcPropertyManagementFee(opts: {
  /** Active tenants of the property (rent basis for per-unit % configs). */
  tenants: FeeTenantLike[];
  /** ManagementFeeConfig rows effective in the period, for this property's units. */
  feeConfigs: FeeConfigLike[];
  /** Property.managementFeeRate */
  propertyRatePercent?: number | null;
  /** Property.managementFeeFlat (per month) */
  propertyFlatAmount?: number | null;
  /** ManagementAgreement.managementFeeRate */
  agreementRatePercent?: number | null;
  /** Gross income (excl. deposits) for the WHOLE period — rate basis. */
  grossIncome: number;
  /** Number of months covered — scales flat/per-unit fees (default 1). */
  monthsMult?: number;
}): number {
  const monthsMult = opts.monthsMult ?? 1;

  if (opts.feeConfigs.length > 0) {
    return opts.tenants.reduce((s, t) => {
      const cfg = opts.feeConfigs.find((c) => c.unitId === t.unitId);
      if (!cfg) return s;
      const perMonth = cfg.flatAmount ?? (cfg.ratePercent / 100) * (t.monthlyRent ?? 0);
      return s + perMonth * monthsMult;
    }, 0);
  }

  if (opts.propertyRatePercent != null && opts.propertyRatePercent > 0) {
    return (opts.propertyRatePercent / 100) * opts.grossIncome;
  }
  if (opts.propertyFlatAmount != null && opts.propertyFlatAmount > 0) {
    return opts.propertyFlatAmount * monthsMult;
  }
  if (opts.agreementRatePercent != null && opts.agreementRatePercent > 0) {
    return (opts.agreementRatePercent / 100) * opts.grossIncome;
  }
  return 0;
}
