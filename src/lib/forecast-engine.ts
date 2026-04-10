import {
  addMonths,
  addYears,
  startOfMonth,
  endOfMonth,
  isSameMonth,
  differenceInYears,
  format,
} from "date-fns";
import type {
  ForecastMonth,
  ForecastResponse,
  ForecastRisk,
  RentBreakdownItem,
  ExpenseBreakdownItem,
} from "@/types/forecast";

// ── Minimal shapes (only fields we need) ────────────────────────────────────

interface TenantInput {
  id: string;
  name: string;
  monthlyRent: number;
  serviceCharge: number;
  leaseStart: Date;
  leaseEnd: Date | null;
  escalationRate: number | null;
  renewalStage: string;
  proposedRent: number | null;
  proposedLeaseEnd: Date | null;
  unit: {
    unitNumber: string;
    property: { id: string; name: string };
  };
}

interface RecurringExpenseInput {
  id: string;
  description: string;
  category: string;
  amount: number;
  frequency: "MONTHLY" | "QUARTERLY" | "ANNUAL";
  nextDueDate: Date;
  property: { name: string } | null;
  unit: { unitNumber: string; property: { name: string } } | null;
}

interface InsurancePolicyInput {
  id: string;
  type: string;
  insurer: string;
  premiumAmount: number | null;
  premiumFrequency: string | null;
  startDate: Date;
  endDate: Date;
  property: { name: string };
}

interface ManagementAgreementInput {
  propertyId: string;
  managementFeeRate: number;
}

interface ComplianceCertificateInput {
  id: string;
  certificateType: string;
  expiryDate: Date | null;
  property: { name: string };
}

interface AssetMaintenanceScheduleInput {
  id: string;
  taskName: string;
  taskCategory: string | null;
  frequency: string;
  nextDue: Date | null;
  estimatedCost: number;
  recurringExpenseId: string | null;
  asset: { name: string; property: { name: string } | null } | null;
  property: { name: string } | null;
}

export interface ForecastInput {
  horizon: number;
  propertyId: string | null;
  tenants: TenantInput[];
  recurringExpenses: RecurringExpenseInput[];
  insurancePolicies: InsurancePolicyInput[];
  agreements: ManagementAgreementInput[];
  assetMaintenanceSchedules: AssetMaintenanceScheduleInput[];
  complianceCertificates: ComplianceCertificateInput[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function advanceRecurringCursor(
  cursor: Date,
  frequency: "MONTHLY" | "QUARTERLY" | "ANNUAL"
): Date {
  if (frequency === "MONTHLY") return addMonths(cursor, 1);
  if (frequency === "QUARTERLY") return addMonths(cursor, 3);
  return addYears(cursor, 1);
}

const INSURANCE_FREQ_MONTHS: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  BIANNUALLY: 6,
  ANNUALLY: 12,
};

function advanceInsuranceCursor(cursor: Date, frequency: string): Date {
  const months = INSURANCE_FREQ_MONTHS[frequency] ?? 12;
  return addMonths(cursor, months);
}

const ASSET_MAINT_FREQ_MONTHS: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  BIANNUALLY: 6,
  ANNUALLY: 12,
};

function advanceAssetMaintenanceCursor(cursor: Date, frequency: string): Date {
  const months = ASSET_MAINT_FREQ_MONTHS[frequency] ?? 12;
  return addMonths(cursor, months);
}

function getEscalatedRent(tenant: TenantInput, monthStart: Date): number {
  if (!tenant.escalationRate) return tenant.monthlyRent;
  const years = differenceInYears(monthStart, tenant.leaseStart);
  if (years <= 0) return tenant.monthlyRent;
  return tenant.monthlyRent * Math.pow(1 + tenant.escalationRate / 100, years);
}

// ── Main engine ───────────────────────────────────────────────────────────────

export function buildForecast(input: ForecastInput): ForecastResponse {
  const { horizon, propertyId, tenants, recurringExpenses, insurancePolicies, agreements, assetMaintenanceSchedules, complianceCertificates } = input;

  const today = new Date();
  const windowStart = startOfMonth(addMonths(today, 1));
  const windowEnd = endOfMonth(addMonths(windowStart, horizon - 1));

  // Build a lookup: propertyId → managementFeeRate
  const agreementMap = new Map<string, number>(
    agreements.map((a) => [a.propertyId, a.managementFeeRate])
  );

  const months: ForecastMonth[] = [];

  for (let i = 0; i < horizon; i++) {
    const monthStart = addMonths(windowStart, i);
    const label = format(monthStart, "MMM yyyy");

    const rentBreakdown: RentBreakdownItem[] = [];
    const expenseBreakdown: ExpenseBreakdownItem[] = [];

    // ── RENT ────────────────────────────────────────────────────────────────
    for (const tenant of tenants) {
      let effectiveLeaseEnd = tenant.leaseEnd;
      let effectiveRent = getEscalatedRent(tenant, monthStart);
      let isRenewalProjection = false;

      // TERMS_AGREED: extend effective end and optionally use proposedRent
      if (tenant.renewalStage === "TERMS_AGREED" && tenant.proposedLeaseEnd) {
        if (tenant.leaseEnd && monthStart > tenant.leaseEnd && tenant.proposedRent != null) {
          effectiveRent = tenant.proposedRent;
          isRenewalProjection = true;
        }
        effectiveLeaseEnd = tenant.proposedLeaseEnd;
      }

      // Skip if lease ended before this month starts
      if (effectiveLeaseEnd !== null && effectiveLeaseEnd < monthStart) {
        continue;
      }

      const isLastMonth =
        effectiveLeaseEnd !== null && isSameMonth(effectiveLeaseEnd, monthStart);

      rentBreakdown.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        unitNumber: tenant.unit.unitNumber,
        propertyName: tenant.unit.property.name,
        rent: effectiveRent,
        serviceCharge: tenant.serviceCharge,
        isLastMonth,
        isRenewalProjection,
      });
    }

    // ── RECURRING EXPENSES ──────────────────────────────────────────────────
    for (const expense of recurringExpenses) {
      let cursor = new Date(expense.nextDueDate);

      // Advance past window start if the nextDueDate is already before this month
      while (cursor < monthStart) {
        cursor = advanceRecurringCursor(cursor, expense.frequency);
      }

      if (isSameMonth(cursor, monthStart)) {
        const propertyName =
          expense.property?.name ??
          expense.unit?.property?.name ??
          "Portfolio";

        expenseBreakdown.push({
          sourceId: expense.id,
          description: expense.description,
          category: expense.category,
          amount: expense.amount,
          type: "RECURRING",
          propertyName,
        });
      }
    }

    // ── INSURANCE PREMIUMS ──────────────────────────────────────────────────
    for (const policy of insurancePolicies) {
      if (!policy.premiumAmount || !policy.premiumFrequency) continue;
      if (policy.endDate < monthStart) continue;

      let cursor = new Date(policy.startDate);

      while (cursor < monthStart) {
        cursor = advanceInsuranceCursor(cursor, policy.premiumFrequency);
      }

      if (isSameMonth(cursor, monthStart) && cursor <= policy.endDate) {
        expenseBreakdown.push({
          sourceId: policy.id,
          description: `${policy.type} Insurance (${policy.insurer})`,
          category: "INSURANCE",
          amount: policy.premiumAmount,
          type: "INSURANCE",
          propertyName: policy.property.name,
        });
      }
    }

    // ── ASSET MAINTENANCE SCHEDULES ─────────────────────────────────────────
    for (const schedule of assetMaintenanceSchedules) {
      // Skip if already linked to a recurring expense (already counted above)
      if (schedule.recurringExpenseId) continue;
      // Skip unscheduled or costless items
      if (!schedule.nextDue || !schedule.estimatedCost) continue;
      // Skip frequencies we can't project monthly (WEEKLY, AS_NEEDED)
      if (!ASSET_MAINT_FREQ_MONTHS[schedule.frequency]) continue;

      let cursor = new Date(schedule.nextDue);
      while (cursor < monthStart) {
        cursor = advanceAssetMaintenanceCursor(cursor, schedule.frequency);
      }

      if (isSameMonth(cursor, monthStart)) {
        const propertyName =
          schedule.asset?.property?.name ?? schedule.property?.name ?? "Portfolio";
        const description = schedule.asset
          ? `${schedule.taskName} — ${schedule.asset.name}`
          : schedule.taskName;

        expenseBreakdown.push({
          sourceId: schedule.id,
          description,
          category: schedule.taskCategory ?? "MAINTENANCE",
          amount: schedule.estimatedCost,
          type: "ASSET_MAINTENANCE",
          propertyName,
        });
      }
    }

    // ── MANAGEMENT FEES ─────────────────────────────────────────────────────
    // Group rentBreakdown by propertyId, compute fee per property
    const revenueByProperty = new Map<string, { name: string; total: number }>();
    for (const item of rentBreakdown) {
      const propId = tenants.find((t) => t.id === item.tenantId)?.unit.property.id ?? "";
      const existing = revenueByProperty.get(propId);
      const amount = item.rent + item.serviceCharge;
      if (existing) {
        existing.total += amount;
      } else {
        revenueByProperty.set(propId, { name: item.propertyName, total: amount });
      }
    }

    for (const [propId, { name, total }] of Array.from(revenueByProperty)) {
      const rate = agreementMap.get(propId);
      if (rate == null || rate === 0) continue;
      expenseBreakdown.push({
        sourceId: `mgmt-${propId}-${i}`,
        description: "Management Fee",
        category: "MANAGEMENT_FEE",
        amount: (rate / 100) * total,
        type: "MANAGEMENT_FEE",
        propertyName: name,
      });
    }

    // ── TOTALS ──────────────────────────────────────────────────────────────
    const forecastedRent = rentBreakdown.reduce(
      (sum, item) => sum + item.rent + item.serviceCharge,
      0
    );
    const projectedExpenses = expenseBreakdown.reduce(
      (sum, item) => sum + item.amount,
      0
    );

    months.push({
      month: format(monthStart, "yyyy-MM-dd"),
      label,
      forecastedRent,
      projectedExpenses,
      netCashflow: forecastedRent - projectedExpenses,
      rentBreakdown,
      expenseBreakdown,
    });
  }

  // ── RISKS ────────────────────────────────────────────────────────────────
  const risks: ForecastRisk[] = [];
  const vacantUnitIds = new Set<string>();

  for (const tenant of tenants) {
    let effectiveEnd = tenant.leaseEnd;
    if (tenant.renewalStage === "TERMS_AGREED" && tenant.proposedLeaseEnd) {
      effectiveEnd = tenant.proposedLeaseEnd;
    }

    if (effectiveEnd && effectiveEnd >= windowStart && effectiveEnd <= windowEnd) {
      risks.push({
        type: "LEASE_EXPIRY",
        tenantName: tenant.name,
        unitNumber: tenant.unit.unitNumber,
        propertyName: tenant.unit.property.name,
        date: format(effectiveEnd, "d MMM yyyy"),
        message: `${tenant.name} (Unit ${tenant.unit.unitNumber}) — lease expires ${format(effectiveEnd, "d MMM yyyy")}`,
      });

      // If no renewal in progress, mark unit as going vacant
      if (tenant.renewalStage === "NONE" || tenant.renewalStage === "NOTICE_SENT") {
        vacantUnitIds.add(tenant.unit.unitNumber);
        risks.push({
          type: "VACANT_UNIT",
          unitNumber: tenant.unit.unitNumber,
          propertyName: tenant.unit.property.name,
          date: format(effectiveEnd, "d MMM yyyy"),
          message: `Unit ${tenant.unit.unitNumber} (${tenant.unit.property.name}) may become vacant from ${format(effectiveEnd, "d MMM yyyy")}`,
        });
      }
    }
  }

  for (const policy of insurancePolicies) {
    if (policy.endDate >= windowStart && policy.endDate <= windowEnd) {
      risks.push({
        type: "INSURANCE_EXPIRY",
        propertyName: policy.property.name,
        date: format(policy.endDate, "d MMM yyyy"),
        message: `${policy.type} Insurance for ${policy.property.name} expires ${format(policy.endDate, "d MMM yyyy")}`,
      });
    }
  }

  // Flag high-cost asset maintenance events due within the window
  for (const schedule of assetMaintenanceSchedules) {
    if (schedule.recurringExpenseId) continue;
    if (!schedule.nextDue || !schedule.estimatedCost) continue;
    if (!ASSET_MAINT_FREQ_MONTHS[schedule.frequency]) continue;

    // Find the first occurrence within the window
    let cursor = new Date(schedule.nextDue);
    while (cursor < windowStart) {
      cursor = advanceAssetMaintenanceCursor(cursor, schedule.frequency);
    }

    if (cursor >= windowStart && cursor <= windowEnd) {
      const propertyName =
        schedule.asset?.property?.name ?? schedule.property?.name ?? "Portfolio";
      const assetLabel = schedule.asset
        ? `${schedule.taskName} — ${schedule.asset.name}`
        : schedule.taskName;

      risks.push({
        type: "ASSET_MAINTENANCE_DUE",
        propertyName,
        date: format(cursor, "d MMM yyyy"),
        message: `Scheduled maintenance due: ${assetLabel} (${propertyName}) — est. cost ${schedule.estimatedCost.toLocaleString()} on ${format(cursor, "d MMM yyyy")}`,
      });
    }
  }

  // Flag compliance certificates expiring within the window
  for (const cert of complianceCertificates) {
    if (!cert.expiryDate) continue;
    if (cert.expiryDate >= windowStart && cert.expiryDate <= windowEnd) {
      risks.push({
        type: "CERT_EXPIRY",
        propertyName: cert.property.name,
        date: format(cert.expiryDate, "d MMM yyyy"),
        message: `${cert.certificateType} certificate for ${cert.property.name} expires ${format(cert.expiryDate, "d MMM yyyy")}`,
      });
    }
  }

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  const summary = {
    totalForecastedRent: months.reduce((s, m) => s + m.forecastedRent, 0),
    totalProjectedExpenses: months.reduce((s, m) => s + m.projectedExpenses, 0),
    totalNetCashflow: months.reduce((s, m) => s + m.netCashflow, 0),
    vacancyCount: vacantUnitIds.size,
    expiringLeaseCount: risks.filter((r) => r.type === "LEASE_EXPIRY").length,
  };

  return { months, risks, summary, horizon, propertyId };
}
