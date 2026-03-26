export interface ReportData {
  title: string;
  property: string;
  longTermPropertyName: string;
  shortLetPropertyName: string;
  period: string;
  generatedAt: string;
  generatedBy: string;

  kpis: {
    grossIncome: number;
    agentCommissions: number;
    totalExpenses: number;
    netProfit: number;
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
}
