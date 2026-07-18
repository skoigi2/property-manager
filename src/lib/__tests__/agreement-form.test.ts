import { describe, it, expect } from "vitest";
import {
  agreementFormSchema,
  agreementApiSchema,
  AGREEMENT_FORM_DEFAULTS,
  normalizeAgreementForForm,
  buildAgreementPutPayload,
} from "../agreement-form";

/** What GET returns for a property whose agreement was saved once with all
 *  payment fields left blank — every optional column comes back NULL. */
const persistedRowWithNulls = {
  id: "agr_1",
  propertyId: "prop_1",
  managementFeeRate: 8.5, vacancyFeeRate: 5, vacancyFeeThresholdMonths: 9,
  newLettingFeeRate: 50, leaseRenewalFeeFlat: 3000, shortTermLettingFeeRate: 10,
  repairAuthorityLimit: 100000, setupFeeTotal: null, setupFeeInstalments: 3,
  rentRemittanceDay: 5, mgmtFeeInvoiceDay: 7, landlordPaymentDays: 2,
  kpiStartDate: null,
  kpiOccupancyTarget: 90, kpiRentCollectionTarget: 90, kpiExpenseRatioTarget: 85,
  kpiTenantTurnoverTarget: 90, kpiDaysToLeaseTarget: 60, kpiRenewalRateTarget: 90,
  kpiMaintenanceCompletionTarget: 95, kpiEmergencyResponseHrs: 24, kpiStandardResponseHrs: 96,
  latePaymentInterestRate: 0,
  tenantKraPin: null,
  tenantBankName: null, tenantBankAccountName: null, tenantBankAccountNumber: null, tenantBankBranch: null,
  tenantMpesaPaybill: null, tenantMpesaAccountNumber: null, tenantMpesaTill: null, tenantPaymentInstructions: null,
  mgmtKraPin: null,
  mgmtBankName: null, mgmtBankAccountName: null, mgmtBankAccountNumber: null, mgmtBankBranch: null,
  mgmtMpesaPaybill: null, mgmtMpesaAccountNumber: null, mgmtMpesaTill: null, mgmtPaymentInstructions: null,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("agreement form — first-time configure (never saved)", () => {
  it("the form defaults validate as-is (Save works without touching anything)", () => {
    const r = agreementFormSchema.safeParse(AGREEMENT_FORM_DEFAULTS);
    expect(r.success).toBe(true);
  });

  it("REGRESSION: resetting the form with the bare { propertyId } the GET returns for a never-saved property fails ~20 required fields — this is why the page must NOT reset in that case", () => {
    const r = agreementFormSchema.safeParse({ propertyId: "prop_1" });
    expect(r.success).toBe(false);
    if (!r.success) {
      // Every numeric field becomes undefined → invalid. This is the exact
      // "click Save, nothing happens" state the id-guard prevents.
      expect(r.error.issues.length).toBeGreaterThanOrEqual(20);
    }
  });
});

describe("agreement form — re-saving a persisted agreement", () => {
  it("REGRESSION: the raw DB row (nulls in optional fields) round-trips through normalise → validate", () => {
    const formValues = normalizeAgreementForForm(persistedRowWithNulls);
    const r = agreementFormSchema.safeParse(formValues);
    expect(r.success).toBe(true);
  });

  it("normalisation maps nulls to controlled-input-safe empty strings", () => {
    const v = normalizeAgreementForForm(persistedRowWithNulls);
    expect(v.tenantBankName).toBe("");
    expect(v.setupFeeTotal).toBe("");
    expect(v.kpiStartDate).toBe("");
  });

  it("a persisted kpiStartDate is trimmed to a date-input value", () => {
    const v = normalizeAgreementForForm({ ...persistedRowWithNulls, kpiStartDate: "2026-03-01T00:00:00.000Z" });
    expect(v.kpiStartDate).toBe("2026-03-01");
  });
});

describe("agreement form — client payload vs API contract", () => {
  it("defaults (first-time save) pass the server schema", () => {
    const clientValues = agreementFormSchema.parse(AGREEMENT_FORM_DEFAULTS);
    const payload = buildAgreementPutPayload(clientValues);
    const r = agreementApiSchema.safeParse(payload);
    expect(r.success).toBe(true);
  });

  it("a re-saved persisted agreement passes the server schema (nulls preserved)", () => {
    const clientValues = agreementFormSchema.parse(normalizeAgreementForForm(persistedRowWithNulls));
    const payload = buildAgreementPutPayload(clientValues);
    expect(payload.tenantBankName).toBeNull();
    expect(payload.setupFeeTotal).toBeNull();
    expect(payload.kpiStartDate).toBeNull();
    const r = agreementApiSchema.safeParse(payload);
    expect(r.success).toBe(true);
  });

  it("the default payment account id round-trips (and null clears it)", () => {
    const withAccount = agreementFormSchema.parse({ ...AGREEMENT_FORM_DEFAULTS, paymentAccountId: "pa_123" });
    const r1 = agreementApiSchema.safeParse(buildAgreementPutPayload(withAccount));
    expect(r1.success).toBe(true);
    if (r1.success) expect(r1.data.paymentAccountId).toBe("pa_123");

    const cleared = agreementFormSchema.parse({ ...AGREEMENT_FORM_DEFAULTS, paymentAccountId: null });
    const r2 = agreementApiSchema.safeParse(buildAgreementPutPayload(cleared));
    expect(r2.success).toBe(true);
    if (r2.success) expect(r2.data.paymentAccountId).toBeNull();
  });

  it("edited values survive the round trip", () => {
    const clientValues = agreementFormSchema.parse({
      ...AGREEMENT_FORM_DEFAULTS,
      managementFeeRate: 10,
      rentRemittanceDay: 3,
      tenantBankName: "Equity Bank",
      kpiStartDate: "2026-08-01",
    });
    const payload = buildAgreementPutPayload(clientValues);
    const r = agreementApiSchema.safeParse(payload);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.managementFeeRate).toBe(10);
      expect(r.data.rentRemittanceDay).toBe(3);
      expect(r.data.tenantBankName).toBe("Equity Bank");
      expect(r.data.kpiStartDate).toBe("2026-08-01");
    }
  });

  it("clear, human messages for out-of-range values (surfaced by the toast)", () => {
    const r = agreementFormSchema.safeParse({ ...AGREEMENT_FORM_DEFAULTS, rentRemittanceDay: 31 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe("Rent remittance day must be at most 28");
    }
  });

  it("a blanked required field produces a named error, not a silent failure", () => {
    const r = agreementFormSchema.safeParse({ ...AGREEMENT_FORM_DEFAULTS, vacancyFeeThresholdMonths: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(["vacancyFeeThresholdMonths"]);
    }
  });
});
