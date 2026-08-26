export interface ReportData {
  title: string;
  property: string;
  currency: string;
  organizationName: string;
  longTermPropertyName: string;
  shortLetPropertyName: string;
  ownerName: string;
  managerName: string;
  period: string;
  generatedAt: string;
  generatedBy: string;

  kpis: {
    grossIncome: number;
    agentCommissions: number;
    totalExpenses: number;
    netProfit: number;
    occupancyRate: number;
    /** ALL income received up to the end of the report period (cash basis,
     *  deposits excluded) — cumulative, not just this period's. */
    incomeToDate?: number;
    /** Headline rent collection: sum(received) / sum(expected rent + service
     *  charge) across the rent-collection rows, as a whole percent (capped at
     *  999). Absent when nothing was expected in the period. */
    collectionRate?: number;
  };

  rentCollection: {
    tenantName: string;
    unit: string;
    type: string;
    expectedRent: number;
    serviceCharge: number;
    received: number;
    variance: number;
    status: string;
    leaseEnd: string | null;
  }[];

  albaPerformance: {
    unitNumber: string;
    type: string;
    grossRevenue: number;
    commissions: number;
    fixedCosts: number;
    variableCosts: number;
    netRevenue: number;
    bookedNights: number;
    daysInMonth: number;
  }[];

  expenses: {
    category: string;
    amount: number;
    isSunkCost: boolean;
  }[];

  pettyCash: {
    totalIn: number;
    totalOut: number;
    balance: number;
    entries: { date: string; description: string; type: string; amount: number }[];
  };

  mgmtFee: {
    owing: number;
    paid: number;
    balance: number;
  };

  alerts: string[];

  vendorSpend?: {
    vendorId: string;
    name: string;
    category: string;
    totalSpend: number;
    expenseCount: number;
  }[];

  taxSummary?: {
    outputTaxAdditive: number;  // VAT/GST collected on income
    outputTaxWithheld: number;  // WHT deducted from owner remittances
    inputTaxAdditive: number;   // VAT/GST paid on expenses (potentially reclaimable)
    inputTaxWithheld: number;   // WHT withheld from contractor payments
    netVatLiability: number;    // outputTaxAdditive − inputTaxAdditive
    hasAnyTax: boolean;
  };

  /** Multi-month reports only: one P&L bucket per month in the range,
   *  bucketed in memory from the already-fetched entries. */
  monthlyBreakdown?: {
    /** e.g. "Jan 2025" */
    label: string;
    grossIncome: number;
    totalExpenses: number;
    /** grossIncome − agent commissions − totalExpenses (same basis as kpis). */
    netProfit: number;
  }[];

  /** Sunk-cost (capital) expenses in the period — excluded from the P&L but
   *  itemised here so they stay visible to the owner. */
  capitalItems?: {
    total: number;
    rows: { date: string; description: string; category: string; amount: number }[];
  };

  /** Point-in-time arrears aging snapshot (as of report generation). */
  arrearsAging?: {
    /** ISO timestamp of when the snapshot was taken (report generation time). */
    asAt: string;
    /** True when the report period ended before the snapshot date — the aging
     *  reflects CURRENT arrears, not the period's. */
    periodEndsBeforeAsAt: boolean;
    totalOutstanding: number;
    totalCount: number;
    buckets: Record<"current" | "d1_30" | "d31_60" | "d61_90" | "d90plus", { amount: number; count: number }>;
    /** Top debtors by age (capped for the PDF). */
    rows: {
      tenantName: string;
      unitNumber: string;
      propertyName: string;
      outstanding: number;
      oldestAgeDays: number;
      invoiceCount: number;
    }[];
  };
}
