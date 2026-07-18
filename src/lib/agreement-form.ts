import { z } from "zod";

// Management Agreement form logic, extracted from the page so the full
// save chain (load-normalise → client validation → PUT payload → API
// validation) is unit-testable — the page itself sits behind auth.

// Optional text fields are stored as NULL when blank — the schema must accept
// null or a previously saved agreement can never be re-saved (the form is
// reset with those nulls and plain z.string().optional() rejects them).
const optionalText = z.string().nullable().optional();

// Required numeric field with a clear, human error message.
const num = (opts: { min: number; max?: number; int?: boolean; label: string }) => {
  let s = z.coerce.number({ message: `${opts.label} must be a number` });
  if (opts.int) s = s.int(`${opts.label} must be a whole number`);
  s = s.min(opts.min, `${opts.label} must be at least ${opts.min}`);
  if (opts.max !== undefined) s = s.max(opts.max, `${opts.label} must be at most ${opts.max}`);
  return s;
};

export const TEXT_FIELDS = [
  "tenantKraPin",
  "tenantBankName", "tenantBankAccountName", "tenantBankAccountNumber", "tenantBankBranch",
  "tenantMpesaPaybill", "tenantMpesaAccountNumber", "tenantMpesaTill", "tenantPaymentInstructions",
  "mgmtKraPin",
  "mgmtBankName", "mgmtBankAccountName", "mgmtBankAccountNumber", "mgmtBankBranch",
  "mgmtMpesaPaybill", "mgmtMpesaAccountNumber", "mgmtMpesaTill", "mgmtPaymentInstructions",
] as const;

export const agreementFormSchema = z.object({
  managementFeeRate:              num({ min: 0, max: 100, label: "Management fee" }),
  vacancyFeeRate:                 num({ min: 0, max: 100, label: "Vacancy fee" }),
  vacancyFeeThresholdMonths:      num({ min: 1, int: true, label: "Vacancy threshold" }),
  newLettingFeeRate:              num({ min: 0, max: 100, label: "New letting fee" }),
  leaseRenewalFeeFlat:            num({ min: 0, label: "Lease renewal fee" }),
  shortTermLettingFeeRate:        num({ min: 0, max: 100, label: "Short-term letting fee" }),
  repairAuthorityLimit:           num({ min: 0, label: "Repair authority limit" }),
  // Literal "" must be FIRST in the union: coerce-number turns "" into 0, so
  // the old order silently saved a blank setup fee as 0 instead of null.
  setupFeeTotal:                  z.literal("").or(z.coerce.number().min(0)).optional(),
  setupFeeInstalments:            num({ min: 1, int: true, label: "Setup fee instalments" }),
  rentRemittanceDay:              num({ min: 1, max: 28, int: true, label: "Rent remittance day" }),
  mgmtFeeInvoiceDay:              num({ min: 1, max: 28, int: true, label: "Mgmt fee invoice day" }),
  landlordPaymentDays:            num({ min: 1, int: true, label: "Landlord payment days" }),
  kpiStartDate:                   z.string().nullable().optional(),
  kpiOccupancyTarget:             num({ min: 0, max: 100, label: "Occupancy target" }),
  kpiRentCollectionTarget:        num({ min: 0, max: 100, label: "Rent collection target" }),
  kpiExpenseRatioTarget:          num({ min: 0, max: 100, label: "Expense ratio target" }),
  kpiTenantTurnoverTarget:        num({ min: 0, max: 100, label: "Tenant turnover target" }),
  kpiDaysToLeaseTarget:           num({ min: 1, int: true, label: "Days to lease target" }),
  kpiRenewalRateTarget:           num({ min: 0, max: 100, label: "Renewal rate target" }),
  kpiMaintenanceCompletionTarget: num({ min: 0, max: 100, label: "Maintenance completion target" }),
  kpiEmergencyResponseHrs:        num({ min: 1, int: true, label: "Emergency response SLA" }),
  kpiStandardResponseHrs:         num({ min: 1, int: true, label: "Standard response SLA" }),
  latePaymentInterestRate:        num({ min: 0, max: 100, label: "Late payment interest" }),
  // Default payment account for tenant invoices (null = organisation branding)
  paymentAccountId:               z.string().nullable().optional(),
  // Tenant invoice payment details (all optional)
  tenantKraPin:              optionalText,
  tenantBankName:            optionalText,
  tenantBankAccountName:     optionalText,
  tenantBankAccountNumber:   optionalText,
  tenantBankBranch:          optionalText,
  tenantMpesaPaybill:        optionalText,
  tenantMpesaAccountNumber:  optionalText,
  tenantMpesaTill:           optionalText,
  tenantPaymentInstructions: optionalText,
  // Manager billing details (all optional)
  mgmtKraPin:                optionalText,
  mgmtBankName:              optionalText,
  mgmtBankAccountName:       optionalText,
  mgmtBankAccountNumber:     optionalText,
  mgmtBankBranch:            optionalText,
  mgmtMpesaPaybill:          optionalText,
  mgmtMpesaAccountNumber:    optionalText,
  mgmtMpesaTill:             optionalText,
  mgmtPaymentInstructions:   optionalText,
});
export type AgreementFormValues = z.infer<typeof agreementFormSchema>;

/** Form defaults for a property that has never saved an agreement. */
export const AGREEMENT_FORM_DEFAULTS: AgreementFormValues = {
  managementFeeRate: 8.5, vacancyFeeRate: 5, vacancyFeeThresholdMonths: 9,
  newLettingFeeRate: 50, leaseRenewalFeeFlat: 3000, shortTermLettingFeeRate: 10,
  repairAuthorityLimit: 100000, setupFeeTotal: "", setupFeeInstalments: 3,
  rentRemittanceDay: 5, mgmtFeeInvoiceDay: 7, landlordPaymentDays: 2,
  kpiStartDate: "",
  kpiOccupancyTarget: 90, kpiRentCollectionTarget: 90, kpiExpenseRatioTarget: 85,
  kpiTenantTurnoverTarget: 90, kpiDaysToLeaseTarget: 60, kpiRenewalRateTarget: 90,
  kpiMaintenanceCompletionTarget: 95, kpiEmergencyResponseHrs: 24, kpiStandardResponseHrs: 96,
  latePaymentInterestRate: 0,
  paymentAccountId: null,
  tenantKraPin: "",
  tenantBankName: "", tenantBankAccountName: "", tenantBankAccountNumber: "", tenantBankBranch: "",
  tenantMpesaPaybill: "", tenantMpesaAccountNumber: "", tenantMpesaTill: "", tenantPaymentInstructions: "",
  mgmtKraPin: "",
  mgmtBankName: "", mgmtBankAccountName: "", mgmtBankAccountNumber: "", mgmtBankBranch: "",
  mgmtMpesaPaybill: "", mgmtMpesaAccountNumber: "", mgmtMpesaTill: "", mgmtPaymentInstructions: "",
};

/**
 * Turn a PERSISTED agreement row (as returned by the GET route) into form
 * values: date trimmed to yyyy-mm-dd, nullable numerics/text normalised to ""
 * so inputs stay controlled and validation accepts them. Only call this for a
 * row that actually exists (has an id) — resetting the form with the bare
 * `{ propertyId }` the route returns for never-configured properties wipes
 * every numeric default and makes all required fields fail validation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeAgreementForForm(agr: any): AgreementFormValues {
  return {
    ...agr,
    kpiStartDate: agr.kpiStartDate ? String(agr.kpiStartDate).slice(0, 10) : "",
    setupFeeTotal: agr.setupFeeTotal ?? "",
    paymentAccountId: agr.paymentAccountId ?? null,
    ...Object.fromEntries(TEXT_FIELDS.map((f) => [f, agr[f] ?? ""])),
  };
}

/** Validated form values → PUT body (empty strings become NULLs). */
export function buildAgreementPutPayload(values: AgreementFormValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ...values,
    setupFeeTotal: values.setupFeeTotal === "" ? null : values.setupFeeTotal,
    kpiStartDate: values.kpiStartDate || null,
  };
  TEXT_FIELDS.forEach((f) => { if (!payload[f]) payload[f] = null; });
  return payload;
}

// ── Server-side schema (used by PUT /api/properties/[id]/agreement) ─────────
// Lives here rather than in the route file so tests can prove the client
// payload and the API contract stay compatible.
export const agreementApiSchema = z.object({
  managementFeeRate:              z.coerce.number().min(0).max(100).default(8.5),
  vacancyFeeRate:                 z.coerce.number().min(0).max(100).default(5),
  vacancyFeeThresholdMonths:      z.coerce.number().int().min(1).default(9),
  newLettingFeeRate:              z.coerce.number().min(0).max(100).default(50),
  leaseRenewalFeeFlat:            z.coerce.number().min(0).default(3000),
  shortTermLettingFeeRate:        z.coerce.number().min(0).max(100).default(10),
  repairAuthorityLimit:           z.coerce.number().min(0).default(100000),
  setupFeeTotal:                  z.coerce.number().min(0).optional().nullable(),
  setupFeeInstalments:            z.coerce.number().int().min(1).default(3),
  rentRemittanceDay:              z.coerce.number().int().min(1).max(28).default(5),
  mgmtFeeInvoiceDay:              z.coerce.number().int().min(1).max(28).default(7),
  landlordPaymentDays:            z.coerce.number().int().min(1).default(2),
  kpiStartDate:                   z.string().optional().nullable(),
  kpiOccupancyTarget:             z.coerce.number().min(0).max(100).default(90),
  kpiRentCollectionTarget:        z.coerce.number().min(0).max(100).default(90),
  kpiExpenseRatioTarget:          z.coerce.number().min(0).max(100).default(85),
  kpiTenantTurnoverTarget:        z.coerce.number().min(0).max(100).default(90),
  kpiDaysToLeaseTarget:           z.coerce.number().int().min(1).default(60),
  kpiRenewalRateTarget:           z.coerce.number().min(0).max(100).default(90),
  kpiMaintenanceCompletionTarget: z.coerce.number().min(0).max(100).default(95),
  kpiEmergencyResponseHrs:        z.coerce.number().int().min(1).default(24),
  kpiStandardResponseHrs:         z.coerce.number().int().min(1).default(96),
  latePaymentInterestRate:        z.coerce.number().min(0).max(100).default(0),
  // Default payment account for tenant invoices
  paymentAccountId:               z.string().optional().nullable(),
  // Tenant invoice payment details
  tenantKraPin:                   z.string().optional().nullable(),
  tenantBankName:                 z.string().optional().nullable(),
  tenantBankAccountName:          z.string().optional().nullable(),
  tenantBankAccountNumber:        z.string().optional().nullable(),
  tenantBankBranch:               z.string().optional().nullable(),
  tenantMpesaPaybill:             z.string().optional().nullable(),
  tenantMpesaAccountNumber:       z.string().optional().nullable(),
  tenantMpesaTill:                z.string().optional().nullable(),
  tenantPaymentInstructions:      z.string().optional().nullable(),
  // Manager billing details
  mgmtKraPin:                     z.string().optional().nullable(),
  mgmtBankName:                   z.string().optional().nullable(),
  mgmtBankAccountName:            z.string().optional().nullable(),
  mgmtBankAccountNumber:          z.string().optional().nullable(),
  mgmtBankBranch:                 z.string().optional().nullable(),
  mgmtMpesaPaybill:               z.string().optional().nullable(),
  mgmtMpesaAccountNumber:         z.string().optional().nullable(),
  mgmtMpesaTill:                  z.string().optional().nullable(),
  mgmtPaymentInstructions:        z.string().optional().nullable(),
});
