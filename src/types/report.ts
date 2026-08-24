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

  /** Point-in-time arrears aging snapshot (as of report generation). */
  arrearsAging?: {
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
