import { z } from "zod";

export const incomeEntrySchema = z.object({
  date: z.string().min(1, "Date is required"),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  unitId: z.string().min(1, "Unit is required"),
  tenantId: z.string().optional(),
  invoiceId: z.string().optional(),
  type: z.enum(["LONGTERM_RENT", "SERVICE_CHARGE", "DEPOSIT", "AIRBNB", "UTILITY_RECOVERY", "OTHER"]),
  grossAmount: z.coerce.number().positive("Amount must be positive"),
  agentCommission: z.coerce.number().min(0).default(0),
  platform: z.enum(["AIRBNB", "BOOKING_COM", "DIRECT", "AGENT"]).optional(),
  agentName: z.string().optional(),
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
  propertyId: z.string().optional(),
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

export type IncomeEntryInput = z.infer<typeof incomeEntrySchema>;
export type ExpenseEntryInput = z.infer<typeof expenseEntrySchema>;
export type ExpenseLineItemInput = z.infer<typeof expenseLineItemSchema>;
export type PettyCashInput = z.infer<typeof pettyCashSchema>;
export type TenantInput = z.infer<typeof tenantSchema>;
