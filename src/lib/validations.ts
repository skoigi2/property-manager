import { z } from "zod";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";

// Coerce empty Select/Input strings to undefined before Zod validates,
// so `.optional()` actually means "not picked" (mirrors the same helper used
// in the property form — see src/app/(dashboard)/properties/page.tsx).
const emptyToUndef = (v: unknown) => (v === "" || v == null ? undefined : v);

export const incomeEntrySchema = z.object({
  date: z.string().min(1, "Date is required"),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  unitId: z.string().min(1, "Unit is required"),
  // The Income form carries tenantId / invoiceId as hidden inputs, which
  // react-hook-form submits as "" when nothing is linked. An empty string
  // must never reach the FK columns (it would fail the Invoice/Tenant FK and
  // 500 every non-rent entry), so it is normalised to "not provided" here.
  tenantId: z.preprocess(emptyToUndef, z.string().optional()),
  invoiceId: z.preprocess(emptyToUndef, z.string().optional()),
  type: z.enum(["LONGTERM_RENT", "SERVICE_CHARGE", "DEPOSIT", "AIRBNB", "UTILITY_RECOVERY", "OTHER", "LETTING_FEE", "RENEWAL_FEE", "VACANCY_FEE", "SETUP_FEE_INSTALMENT", "CONSULTANCY_FEE"]),
  grossAmount: z.coerce.number().positive("Amount must be positive"),
  agentCommission: z.preprocess(emptyToUndef, z.coerce.number().min(0).default(0)),
  // Platform/agent/nightly-rate only render for AIRBNB; if the user switched
  // type afterwards their unmounted "" values must not block the submit.
  platform: z.preprocess(emptyToUndef, z.enum(["AIRBNB", "BOOKING_COM", "DIRECT", "AGENT"]).optional()),
  agentName: z.preprocess(emptyToUndef, z.string().optional()),
  nightlyRate: z.preprocess(emptyToUndef, z.coerce.number().min(0).optional()),
  note: z.string().optional(),
});

// Mirrors the UnitOfMeasure enum in prisma/schema.prisma — descriptive only,
// never used in any calculation. OTHER pairs with the unitOther free-text.
export const UNIT_OF_MEASURE_VALUES = [
  "UNIT", "ITEM", "SET", "PAIR",          // count
  "KG", "G", "TONNE",                     // weight
  "LITRE", "ML",                          // volume
  "M", "MM",                              // length
  "M2",                                   // area
  "HOUR", "DAY", "TRIP",                  // labour / time
  "OTHER",
] as const;

export const expenseLineItemSchema = z.object({
  id: z.string().optional(),
  category: z.enum(["LABOUR", "MATERIAL", "QUOTE", "TRANSACTION_CHARGE"]),
  description: z.string().optional(),
  // Optional per-line charge/service date (informational — the parent
  // expense's date drives P&L bucketing).
  date: z.string().optional().nullable(),
  amount: z.coerce.number().min(0),
  // Optional unit of measurement for quantity — context only. unitOther is
  // used when unit = OTHER; the routes null it otherwise (light enforcement,
  // legacy rows unaffected).
  unit: z.enum(UNIT_OF_MEASURE_VALUES).optional().nullable(),
  unitOther: z.string().max(60).optional().nullable(),
  // Optional qty × rate breakdown — when BOTH are present the server derives
  // amount = round2(quantity * unitRate) and stores it; otherwise amount is
  // entered directly. quantity may be fractional (e.g. 2.5 kg).
  quantity: z.coerce.number().positive().optional(),
  unitRate: z.coerce.number().min(0).optional(),
  // Informational only — value of a discount received. `amount` is already
  // net-of-discount; this never enters any total.
  discountAmount: z.coerce.number().min(0).optional(),
  isVatable: z.boolean().default(false),
  paymentStatus: z.enum(["UNPAID", "PARTIAL", "PAID"]).default("UNPAID"),
  amountPaid: z.coerce.number().min(0).default(0),
  paymentReference: z.string().optional(),
  // Per-line payment date — items on one invoice often settle on different days.
  paymentDate: z.string().optional().nullable(),
});

export const expenseEntrySchema = z.object({
  date: z.string().min(1, "Date is required"),
  scope: z.enum(["UNIT", "PROPERTY", "PORTFOLIO"], { message: "Pick a scope" }),
  unitId: z.string().optional(),
  unitIds: z.array(z.string()).optional(),
  propertyId: z.string().optional(),
  // The form renders a "Select category" placeholder (value ""), so a
  // never-touched select fails here with a human message instead of the
  // first option silently winning.
  category: z.enum(EXPENSE_CATEGORIES, { message: "Pick a category" }),
  // Blank input coerces to 0 and is rejected: a zero-value expense is never
  // meaningful and only produces "why is my P&L unchanged" confusion.
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  description: z.string().optional(),
  isSunkCost: z.boolean().optional(),
  paidFromPettyCash: z.boolean().optional(),
  amountPaid: z.coerce.number().min(0).optional(),
  dueDate: z.string().optional(),
  vatAmount: z.coerce.number().min(0).optional(),
  // Informational only — value of a discount received (see line-item field).
  discountAmount: z.coerce.number().min(0).optional(),
  paymentMethod: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.enum(["BANK_TRANSFER", "MPESA", "CASH", "CARD", "CHEQUE", "OTHER"]).optional(),
  ),
  paymentReference: z.string().optional(),
  paymentDate: z.string().optional(),
  notes: z.string().optional(),
  lineItems: z.array(expenseLineItemSchema).optional(),
}).superRefine((v, ctx) => {
  // Scope/target consistency. Without these a "Whole Property" expense with
  // no property picked sent propertyId "" (FK failure, generic "Failed to
  // save"), and a "Unit" expense with nothing ticked saved with no unit or
  // property at all, invisible under every property filter.
  if (v.scope === "PROPERTY" && !v.propertyId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["propertyId"], message: "Pick the property this cost belongs to" });
  }
  if (v.scope === "UNIT") {
    const count = (v.unitIds?.length ?? 0) || (v.unitId ? 1 : 0);
    if (count === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["unitIds"], message: "Tick at least one unit, or change the scope to Whole Property" });
    }
  }
  // Payment sanity (single-amount expenses only; lines carry their own).
  if (!(v.lineItems?.length ?? 0)) {
    if ((v.amountPaid ?? 0) > v.amount + 0.005) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["amountPaid"], message: "Amount paid cannot exceed the expense amount" });
    }
    if (v.paymentDate && !(v.amountPaid ?? 0) && !v.paidFromPettyCash) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["paymentDate"], message: "A payment date needs an amount paid. Enter it, or clear the date" });
    }
  }
});

export const pettyCashSchema = z.object({
  date: z.string().min(1, "Date is required"),
  type: z.enum(["IN", "OUT"]),
  amount: z.coerce.number().positive("Amount must be positive"),
  description: z.string().min(1, "Description is required"),
  receiptRef: z.string().optional(),
  propertyId: z.string().optional(),
});

export const pettyCashApproveSchema = z.object({
  action: z.enum(["approve", "reject"]),
  approvalNotes: z.string().optional(),
  rejectionReason: z.string().optional(),
});

export const tenantSchema = z.object({
  name:             z.string().min(1, "Name is required"),
  email:            z.string().email("Invalid email").optional().or(z.literal("")),
  phone:            z.string().optional(),
  unitId:           z.string().min(1, "Unit is required"),
  depositAmount:    z.coerce.number().min(0),
  leaseStart:       z.string().min(1, "Lease start date is required"),
  leaseEnd:         z.string().optional(),
  monthlyRent:      z.coerce.number().positive("Rent must be positive"),
  serviceCharge:    z.coerce.number().min(0).default(0),
  isActive:         z.boolean().default(true),
  notes:            z.string().optional(),
  paymentFrequency: z.preprocess(
    emptyToUndef,
    z.enum(["MONTHLY", "QUARTERLY", "BIANNUAL", "ANNUAL"]).optional(),
  ),
  escalationRate:   z.preprocess(emptyToUndef, z.coerce.number().min(0).max(100).optional()),
  escalationIntervalYears: z.preprocess(emptyToUndef, z.coerce.number().int().min(1).max(20).optional()),
  parkingFee:       z.preprocess(emptyToUndef, z.coerce.number().min(0).optional()),
  poBox:            z.string().optional(),
  // Extra reachable people beyond the primary email/phone. Blank rows are
  // stripped client-side; each kept row needs at least one filled field.
  additionalContacts: z.array(z.object({
    label: z.string().optional(),
    email: z.string().email("Invalid email").optional().or(z.literal("")),
    phone: z.string().optional(),
  })).optional(),
});

export const managementFeeConfigSchema = z.object({
  unitId: z.string().min(1),
  ratePercent: z.coerce.number().min(0).max(100).default(0),
  flatAmount: z.coerce.number().min(0).optional(),
  effectiveFrom: z.string().min(1),
  effectiveTo: z.string().optional(),
});

const INCOME_TYPE_VALUES = ["LONGTERM_RENT","SERVICE_CHARGE","DEPOSIT","AIRBNB","UTILITY_RECOVERY","OTHER","LETTING_FEE","RENEWAL_FEE","VACANCY_FEE","SETUP_FEE_INSTALMENT","CONSULTANCY_FEE"] as const;
const OWNER_INVOICE_TYPE_VALUES = ["LETTING_FEE","PERIODIC_LETTING_FEE","RENEWAL_FEE","MANAGEMENT_FEE","VACANCY_FEE","SETUP_FEE_INSTALMENT","CONSULTANCY_FEE"] as const;

export const ownerInvoiceLineItemSchema = z.object({
  description: z.string().min(1),
  amount:      z.coerce.number().positive(),
  unitId:      z.string().optional().nullable(),
  tenantId:    z.string().optional().nullable(),
  incomeType:  z.enum(INCOME_TYPE_VALUES),
});

export const ownerInvoiceCreateSchema = z.object({
  propertyId:  z.string().min(1),
  type:        z.enum(OWNER_INVOICE_TYPE_VALUES),
  periodYear:  z.number().int().min(2020),
  periodMonth: z.number().int().min(1).max(12),
  lineItems:   z.array(ownerInvoiceLineItemSchema).min(1),
  dueDate:     z.string().min(1),
  notes:       z.string().optional(),
});

export const ownerInvoiceUpdateSchema = z.object({
  status:     z.enum(["DRAFT","SENT","PAID","OVERDUE","CANCELLED"]).optional(),
  paidAt:     z.string().nullable().optional(),
  paidAmount: z.number().nullable().optional(),
  notes:      z.string().optional(),
  dueDate:    z.string().optional(),
  lineItems:  z.array(ownerInvoiceLineItemSchema).optional(),
});

export type IncomeEntryInput = z.infer<typeof incomeEntrySchema>;
export type ExpenseEntryInput = z.infer<typeof expenseEntrySchema>;
export type ExpenseLineItemInput = z.infer<typeof expenseLineItemSchema>;
export type PettyCashInput = z.infer<typeof pettyCashSchema>;
export type TenantInput = z.infer<typeof tenantSchema>;
export type OwnerInvoiceLineItem = z.infer<typeof ownerInvoiceLineItemSchema>;
export type OwnerInvoiceCreateInput = z.infer<typeof ownerInvoiceCreateSchema>;

// Case workflow
export const CASE_TYPES = ["MAINTENANCE", "LEASE_RENEWAL", "ARREARS", "COMPLIANCE", "GENERAL", "COMPLAINT"] as const;
const CASE_STATUSES = ["OPEN", "IN_PROGRESS", "AWAITING_APPROVAL", "AWAITING_VENDOR", "AWAITING_TENANT", "RESOLVED", "CLOSED"] as const;
const CASE_WAITING_ON = ["MANAGER", "OWNER", "TENANT", "VENDOR", "NONE"] as const;

export const createCaseSchema = z.object({
  caseType:         z.enum(CASE_TYPES),
  subjectId:        z.string().min(1),
  propertyId:       z.string().min(1),
  unitId:           z.string().optional().nullable(),
  title:            z.string().min(1).max(200),
  status:           z.enum(CASE_STATUSES).optional(),
  stage:            z.string().optional().nullable(),
  assignedToUserId: z.string().optional().nullable(),
  waitingOn:        z.enum(CASE_WAITING_ON).optional(),
  initialBody:      z.string().optional(),
});

export const updateCaseSchema = z.object({
  title:            z.string().min(1).max(200).optional(),
  status:           z.enum(CASE_STATUSES).optional(),
  stage:            z.string().nullable().optional(),
  assignedToUserId: z.string().nullable().optional(),
  waitingOn:        z.enum(CASE_WAITING_ON).optional(),
});

export const createCaseEventSchema = z.object({
  kind: z.enum(["COMMENT", "DOCUMENT_ADDED"]).default("COMMENT"),
  body: z.string().min(1).max(20_000),
});

// ─── Tenant complaints ────────────────────────────────────────────────────────
export const COMPLAINT_CATEGORIES = ["NOISE", "NEIGHBOUR", "SECURITY", "PREMISES", "STAFF_CONDUCT", "OTHER"] as const;

export const createComplaintSchema = z.object({
  propertyId:    z.string().min(1),
  unitId:        z.string().optional().nullable(),
  tenantId:      z.string().optional().nullable(),
  subjectUnitId: z.string().optional().nullable(),
  category:      z.enum(COMPLAINT_CATEGORIES).default("OTHER"),
  title:         z.string().min(3, "Give the complaint a short title").max(200),
  description:   z.string().max(5000).optional().nullable(),
});
export type CreateComplaintInput = z.infer<typeof createComplaintSchema>;

export const complaintActionSchema = z.object({
  action: z.enum(["acknowledge", "investigate", "await_tenant", "resolve", "reopen", "close"]),
  note:   z.string().max(2000).optional(),
});

export const createApprovalSchema = z.object({
  requestedFromEmail: z.string().email(),
  requestedFromName:  z.string().max(200).optional(),
  question:           z.string().min(1).max(2000),
  amount:             z.number().nonnegative().optional(),
  currency:           z.string().length(3).optional(),
  expiresInHours:     z.number().int().min(1).max(168).default(72),
});

export const respondToApprovalSchema = z.object({
  action:          z.enum(["APPROVE", "REJECT", "DISPUTE"]),
  respondedByName: z.string().min(1).max(200),
});

export const advanceCaseSchema = z.object({
  to:    z.number().int().nonnegative().optional(),
  toKey: z.string().optional(),
  note:  z.string().max(1000).optional(),
}).refine((d) => d.to !== undefined || d.toKey !== undefined, { message: "to or toKey is required" });

export const regressCaseSchema = z.object({
  reason: z.string().min(1).max(1000),
});

export const setSlaSchema = z.object({
  stageSlaHours: z.record(z.string(), z.number().int().min(1).max(8760).nullable()).optional(),
  slaHours:      z.number().int().min(1).max(8760).optional(),
}).refine((d) => d.stageSlaHours !== undefined || d.slaHours !== undefined, { message: "stageSlaHours or slaHours is required" });

export const linkInvoiceSchema = z.object({
  invoiceId: z.string().min(1),
});

// Manual email composer (super-admin /admin/emails)
export const manualEmailSchema = z.object({
  to: z.string().email("Valid recipient email is required"),
  subject: z.string().min(1, "Subject is required").max(200),
  bodyHtml: z.string().min(1, "Message body is required").max(50_000),
  replyTo: z.string().email().optional().or(z.literal("")),
  inReplyToId: z.string().optional(),
});

// ─── Checkout / Move-Out ─────────────────────────────────────────────────────

export const checkoutDeductionSchema = z.object({
  description: z.string().min(1, "Description required").max(200),
  amount: z.coerce.number().min(0),
  category: z.enum(["UTILITY", "SERVICE_CHARGE", "RENT_BALANCE", "DAMAGE", "OTHER"]).default("OTHER"),
});

export const keysReturnedSchema = z.object({
  mainDoor: z.coerce.number().int().min(0).default(0),
  bedroom:  z.coerce.number().int().min(0).default(0),
  gate:     z.coerce.number().int().min(0).default(0),
  mailbox:  z.coerce.number().int().min(0).default(0),
});

const utilityTransferSchema = z.object({
  done: z.boolean().default(false),
  date: z.string().optional().nullable(),
});

export const utilityTransfersSchema = z.object({
  electricity: utilityTransferSchema.default({ done: false }),
  water:       utilityTransferSchema.default({ done: false }),
  internet:    utilityTransferSchema.default({ done: false }),
});

export const refundDetailsSchema = z.object({
  payableTo:     z.string().optional(),
  recipientName: z.string().optional(),
  mobileNumber:  z.string().optional(),
  accountNumber: z.string().optional(),
  bankName:      z.string().optional(),
  accountName:   z.string().optional(),
});

export const checkoutProcessSchema = z.object({
  checkOutDate:          z.string().min(1, "Check-out date required"),
  damageFound:           z.boolean().default(false),
  inventoryDamageAmount: z.coerce.number().min(0).default(0),
  inventoryDamageNotes:  z.string().max(2000).optional().nullable(),
  damageKeptByLandlord:  z.boolean().default(true),
  rentBalanceOwing:      z.coerce.number().min(0).default(0),
  rentBalanceSource:     z.enum(["auto", "override"]).optional(),
  deductions:            z.array(checkoutDeductionSchema).default([]),
  keysReturned:          keysReturnedSchema.optional(),
  utilityTransfers:      utilityTransfersSchema.optional(),
  refundMethod:          z.enum(["CHEQUE", "CASH", "MOBILE_TRANSFER", "BANK_TRANSFER"]).optional().nullable(),
  refundDetails:         refundDetailsSchema.optional(),
  notes:                 z.string().max(2000).optional().nullable(),
});

export const checkoutFinalizeSchema = checkoutProcessSchema.extend({
  finalize: z.literal(true),
});

// ─── Condition Reports / Move-In Checklist ───────────────────────────────────

export const conditionItemSchema = z.object({
  id:       z.string().min(1),
  room:     z.string().min(1).max(80),
  feature:  z.string().min(1).max(80),
  status:   z.enum(["PERFECT", "GOOD", "FAIR", "POOR"]).nullable().optional(),
  notes:    z.string().max(2000).optional().default(""),
  photoIds: z.array(z.string()).default([]),
});

export const conditionReportCreateSchema = z.object({
  reportType:      z.enum(["MOVE_IN", "MID_TERM", "MOVE_OUT"]),
  reportDate:      z.string().min(1, "Report date required"),
  tenantId:        z.string().optional().nullable(),
  items:           z.array(conditionItemSchema).default([]),
  overallComments: z.string().max(5000).optional().nullable(),
});

export const conditionReportPatchSchema = z.object({
  reportDate:      z.string().optional(),
  tenantId:        z.string().optional().nullable(),
  items:           z.array(conditionItemSchema).optional(),
  overallComments: z.string().max(5000).optional().nullable(),
  signedByTenant:  z.boolean().optional(),
  signedByManager: z.boolean().optional(),
});
