import { describe, it, expect } from "vitest";
import { subMonths, addYears } from "date-fns";
import { buildForecast } from "../forecast-engine";

// The forecast window starts at the first of NEXT month, so anchor test
// leases relative to "now" to stay deterministic.

const emptyInput = {
  propertyId: null,
  recurringExpenses: [],
  insurancePolicies: [],
  agreements: [],
  assetMaintenanceSchedules: [],
  complianceCertificates: [],
};

const tenant = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  name: "Tenant One",
  monthlyRent: 10000,
  serviceCharge: 500,
  leaseStart: subMonths(new Date(), 24),
  leaseEnd: addYears(new Date(), 5),
  escalationRate: null,
  renewalStage: "NONE",
  proposedRent: null,
  proposedLeaseEnd: null,
  unit: { unitNumber: "A1", property: { id: "p1", name: "Prop" } },
  ...over,
});

describe("buildForecast rent schedule", () => {
  it("monthly payers contribute rent + service charge every month", () => {
    const res = buildForecast({ ...emptyInput, horizon: 6, tenants: [tenant()] } as never);
    expect(res.months).toHaveLength(6);
    for (const m of res.months) {
      expect(m.rentBreakdown).toHaveLength(1);
      expect(m.rentBreakdown[0].rent).toBe(10000);
      expect(m.rentBreakdown[0].serviceCharge).toBe(500);
    }
  });

  it("annual payers contribute one full-period inflow on the billing month only", () => {
    const res = buildForecast({
      ...emptyInput,
      horizon: 12,
      tenants: [tenant({ paymentFrequency: "ANNUAL" })],
    } as never);
    const billed = res.months.filter((m) => m.rentBreakdown.length > 0);
    expect(billed).toHaveLength(1);
    expect(billed[0].rentBreakdown[0].rent).toBe(10000 * 12);
    expect(billed[0].rentBreakdown[0].serviceCharge).toBe(500 * 12);
    // Total over the window equals 12 months of rent + service — just lumped.
    const total = res.months.reduce((s, m) => s + m.forecastedRent, 0);
    expect(total).toBe((10000 + 500) * 12);
  });

  it("quarterly payers bill every third month", () => {
    const res = buildForecast({
      ...emptyInput,
      horizon: 12,
      tenants: [tenant({ paymentFrequency: "QUARTERLY" })],
    } as never);
    const billed = res.months.filter((m) => m.rentBreakdown.length > 0);
    expect(billed).toHaveLength(4);
    for (const m of billed) {
      expect(m.rentBreakdown[0].rent).toBe(10000 * 3);
      expect(m.rentBreakdown[0].serviceCharge).toBe(500 * 3);
    }
  });

  it("leases that ended stop contributing", () => {
    const res = buildForecast({
      ...emptyInput,
      horizon: 6,
      tenants: [tenant({ leaseEnd: subMonths(new Date(), 1) })],
    } as never);
    expect(res.months.every((m) => m.rentBreakdown.length === 0)).toBe(true);
  });

  it("escalation applies to the projected amount", () => {
    // 10% escalation, lease started 2 years ago → 10000 * 1.1^2 per month.
    const res = buildForecast({
      ...emptyInput,
      horizon: 3,
      tenants: [tenant({ escalationRate: 10 })],
    } as never);
    expect(res.months[0].rentBreakdown[0].rent).toBeCloseTo(10000 * 1.21, 5);
  });
});
