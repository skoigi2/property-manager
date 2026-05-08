import { z } from "zod";

export const incomeEntrySchema = z.object({
  date: z.string().min(1, "Date is required"),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  unitId: z.string().min(1, "Unit is required"),
  tenantId: z.string().optional(),
  invoiceId: z.string().optional(),
  type: z.enum(["LONGTERM_RENT", "SERVICE_CHARGE", "DEPOSIT", "AIRBNB", "UTILITY_RECOVERY", "OTHER", "LETTING_FEE", "RENEWAL_FEE", "VACANCY_FEE", "SETUP_FEE_INSTALMENT", "CONSULTANCY_FEE"]),
  grossAmount: z.coerce.number().positive("Amount must be positive"),
  agentCommission: z.coerce.number().min(0).default(0),
  platform: z.enum(["AIRBNB", "BOOKING_COM", "DIRECT", "AGENT"]).optional(),
  agentName: z.string().optional(),
  nightlyRate: z.coerce.number().min(0).optional(),
  note: z.string().optional(),
});

export const expenseLineItemSchema = z.object({
  id: z.string().optional(),
  category: z.enum(["LABOUR", "MATERIAL", "QUOTE"]),
  description: z.string().optional(),
  amount: z.coerce.number().min(0),
  isVatable: z.boolean().default(false),
  paymentStatus: z.enum(["UNPAID", "PARTIAL", "PAID"]).default("UNPAID"),
  amountPaid: z.coerce.number().min(0).default(0),
  paymentReference: z.string().optional(),
});

export const expenseEntrySchema = z.object({
  date: z.string().min(1, "Date is required"),
  scope: z.enum(["UNIT", "PROPERTY", "PORTFOLIO"]),
  unitId: z.string().optional(),
  unitIds: z.array(z.string()).optional(),
  propertyId: z.string().optional(),
  category: z.enum([
    "SERVICE_CHARGE",
    "MANAGEMENT_FEE",
    "WIFI",
    "WATER",
    "ELECTRICITY",
    "CLEANER",
    "CONSUMABLES",
    "MAINTENANCE",
    "REINSTATEMENT",
    "CAPITAL",
    "OTHER",
  ]),
  amount: z.coerce.number().min(0),
  description: z.string().optional(),
  isSunkCost: z.boolean().optional(),
  paidFromPettyCash: z.boolean().optional(),
  lineItems: z.array(expenseLineItemSchema).optional(),
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
  name:          z.string().min(1, "Name is required"),
  email:         z.string().email("Invalid email").optional().or(z.literal("")),
  phone:         z.string().optional(),
  unitId:        z.string().min(1, "Unit is required"),
  depositAmount: z.coerce.number().min(0),
  leaseStart:    z.string().min(1, "Lease start date is required"),
  leaseEnd:      z.string().optional(),
  monthlyRent:   z.coerce.number().positive("Rent must be positive"),
  serviceCharge: z.coerce.number().min(0).default(0),
  isActive:      z.boolean().default(true),
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
