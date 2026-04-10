export interface ForecastMonth {
  /** ISO string: first day of the month, e.g. "2026-04-01" */
  month: string;
  /** Short human label, e.g. "Apr 2026" */
  label: string;
  /** Total forecasted rent + service charges from active leases */
  forecastedRent: number;
  /** Total projected operating expenses (recurring + insurance + management fees) */
  projectedExpenses: number;
  /** forecastedRent - projectedExpenses */
  netCashflow: number;
  /** Per-tenant income breakdown */
  rentBreakdown: RentBreakdownItem[];
  /** Per-source expense breakdown */
  expenseBreakdown: ExpenseBreakdownItem[];
}

export interface RentBreakdownItem {
  tenantId: string;
  tenantName: string;
  unitNumber: string;
  propertyName: string;
  rent: number;
  serviceCharge: number;
  /** true if this is the last month the lease is active */
  isLastMonth: boolean;
  /** true if using proposedRent/proposedLeaseEnd from a TERMS_AGREED renewal */
  isRenewalProjection: boolean;
}

export interface ExpenseBreakdownItem {
  sourceId: string;
  description: string;
  category: string;
  amount: number;
  type: "RECURRING" | "INSURANCE" | "MANAGEMENT_FEE" | "ASSET_MAINTENANCE";
  propertyName?: string;
}

export interface ForecastRisk {
  type: "LEASE_EXPIRY" | "VACANT_UNIT" | "INSURANCE_EXPIRY" | "ASSET_MAINTENANCE_DUE" | "CERT_EXPIRY";
  tenantName?: string;
  unitNumber?: string;
  propertyName?: string;
  date?: string;
  message: string;
}

export interface ForecastSummary {
  totalForecastedRent: number;
  totalProjectedExpenses: number;
  totalNetCashflow: number;
  /** Number of units that go vacant within the window */
  vacancyCount: number;
  /** Number of leases expiring within the window */
  expiringLeaseCount: number;
}

export interface ForecastResponse {
  months: ForecastMonth[];
  risks: ForecastRisk[];
  summary: ForecastSummary;
  /** Forecast horizon in months (3, 6, or 12) */
  horizon: number;
  /** The propertyId filter used, or null for all properties */
  propertyId: string | null;
}
