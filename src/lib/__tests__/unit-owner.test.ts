import { describe, it, expect } from "vitest";
import { parseAccountType, unitOwnerOverrides, regularChargeLabel } from "../unit-owner";
import { tenantSchema } from "../validations";
import { getLeaseStatus } from "../date-utils";
import { computeArrears, buildLedger, countsTowardRentSide, type LedgerTenant, type LedgerEntry } from "../rent-ledger";
import { calcPropertyManagementFee, perUnitFeeBase } from "../management-fee";

const TODAY = new Date(2026, 6, 15); // 15 Jul 2026

// A unit owner on a managed development: no rent, service charge only.
const owner: LedgerTenant = {
  id: "o1", unitId: "u1", leaseStart: new Date(2026, 0, 1), leaseEnd: null,
  monthlyRent: 0, serviceCharge: 6000, paymentFrequency: null, rentHistory: [],
};
const sc = (date: Date, grossAmount: number): LedgerEntry => ({ type: "SERVICE_CHARGE", date, grossAmount, tenantId: "o1", unitId: "u1" });

describe("unit owner accounts", () => {
  it("reads the importers' Account Type column", () => {
    expect(parseAccountType("Unit owner")).toBe(true);
    expect(parseAccountType(" OWNER ")).toBe(true);
    expect(parseAccountType("Tenant")).toBe(false);
    expect(parseAccountType("")).toBeNull();
    expect(parseAccountType(undefined)).toBeNull();
    expect(parseAccountType("Company")).toBeNull();
  });

  it("forces no rent, deposit, lease end or rent reviews on an owner — and nothing on a tenant", () => {
    expect(unitOwnerOverrides(true)).toMatchObject({ monthlyRent: 0, depositAmount: 0, leaseEnd: null, escalationRate: null, escalationAmount: null, renewalStage: "NONE" });
    expect(unitOwnerOverrides(false)).toEqual({});
    expect(regularChargeLabel(true)).toBe("Service charge");
    expect(regularChargeLabel(false)).toBe("Rent");
  });

  it("accepts rent 0 for an owner only", () => {
    const base = { name: "Grace", unitId: "u1", depositAmount: 0, leaseStart: "2026-01-01", monthlyRent: 0, serviceCharge: 6000 };
    expect(tenantSchema.safeParse({ ...base, isUnitOwner: true }).success).toBe(true);
    const asTenant = tenantSchema.safeParse(base);
    expect(asTenant.success).toBe(false);
    expect(asTenant.error?.issues[0]?.path).toEqual(["monthlyRent"]);
    expect(tenantSchema.safeParse({ ...base, monthlyRent: 25000 }).success).toBe(true);
  });

  it("has no lease to expire", () => {
    expect(getLeaseStatus(null, false, true)).toBe("OK");
    expect(getLeaseStatus(null)).toBe("TBC");
  });

  it("counts service charge receipts against what's due — no false arrears", () => {
    expect(countsTowardRentSide("SERVICE_CHARGE", { isUnitOwner: true })).toBe(true);
    expect(countsTowardRentSide("LONGTERM_RENT", {})).toBe(true);
    expect(countsTowardRentSide("UTILITY_RECOVERY", { isUnitOwner: true })).toBe(false);
    expect(countsTowardRentSide("DEPOSIT", { isUnitOwner: true })).toBe(false);
    // A tenant whose service charge is part of their charges: a separate SC receipt pays it.
    expect(countsTowardRentSide("SERVICE_CHARGE", { serviceCharge: 2000 })).toBe(true);
    // Service charge collected outside the tenant's charges never reads as rent paid.
    expect(countsTowardRentSide("SERVICE_CHARGE", { serviceCharge: 0 })).toBe(false);
    const paid = Array.from({ length: 7 }, (_, i) => sc(new Date(2026, i, 3), 6000));
    expect(computeArrears(owner, paid, 0, TODAY).totalArrears).toBe(0);
    const twoShort = paid.slice(0, 5);
    expect(computeArrears(owner, twoShort, 0, TODAY).totalArrears).toBe(12000);
    expect(buildLedger(owner, twoShort, TODAY).reduce((t, r) => t + r.shortfall, 0)).toBe(12000);
  });

  it("doesn't let a separately collected service charge hide a tenant's rent arrears", () => {
    const tenant: LedgerTenant = { id: "t1", unitId: "u2", leaseStart: new Date(2026, 0, 1), leaseEnd: null, monthlyRent: 10000, serviceCharge: 0, paymentFrequency: null, rentHistory: [] };
    const entries: LedgerEntry[] = [
      ...Array.from({ length: 6 }, (_, i) => ({ type: "LONGTERM_RENT", date: new Date(2026, i, 3), grossAmount: 10000, tenantId: "t1", unitId: "u2" })),
      ...Array.from({ length: 7 }, (_, i) => ({ type: "SERVICE_CHARGE", date: new Date(2026, i, 3), grossAmount: 2000, tenantId: "t1", unitId: "u2" })),
    ];
    // July's rent is unpaid; the 7 × 2,000 service charge must not cover it.
    expect(computeArrears(tenant, entries, 0, TODAY).totalArrears).toBe(10000);
  });

  it("charges a per-unit % management fee on an owner's service charge", () => {
    expect(perUnitFeeBase({ unitId: "u1", monthlyRent: 0, serviceCharge: 6000, isUnitOwner: true })).toBe(6000);
    expect(perUnitFeeBase({ unitId: "u2", monthlyRent: 30000, serviceCharge: 3000 })).toBe(30000);
    const fee = calcPropertyManagementFee({
      tenants: [
        { unitId: "u1", monthlyRent: 0, serviceCharge: 6000, isUnitOwner: true },
        { unitId: "u2", monthlyRent: 30000, serviceCharge: 3000, isUnitOwner: false },
      ],
      feeConfigs: [{ unitId: "u1", ratePercent: 10, flatAmount: null }, { unitId: "u2", ratePercent: 10, flatAmount: null }],
      grossIncome: 0,
    });
    expect(fee).toBe(600 + 3000);
  });
});
