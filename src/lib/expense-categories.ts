// Single source of truth for the ExpenseCategory value list + display labels.
// The Prisma enum (schema.prisma) is authoritative; this tuple mirrors it so
// zod schemas and UI dropdowns can't drift apart (the bulk-retype route once
// carried a stale 11-value copy and rejected the other half of the enum).
// When adding a category: update the Prisma enum, then this file — page
// dropdowns, expenseEntrySchema, and the bulk route all read from here.

export const EXPENSE_CATEGORIES = [
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
  "SECURITY",
  "GARBAGE_COLLECTION",
  "LANDSCAPING",
  "PEST_CONTROL",
  "INSURANCE",
  "PROPERTY_TAX",
  "LEGAL_FEES",
  "LICENSE_PERMIT",
  "MARKETING",
  "BANK_CHARGES",
  "STAFF_WAGES",
  "OTHER",
] as const;

export type ExpenseCategoryValue = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategoryValue, string> = {
  SERVICE_CHARGE: "Service Charge",
  MANAGEMENT_FEE: "Management Fee",
  WIFI: "Wi-Fi",
  WATER: "Water",
  ELECTRICITY: "Electricity",
  CLEANER: "Cleaner",
  CONSUMABLES: "Consumables",
  MAINTENANCE: "Maintenance",
  REINSTATEMENT: "Reinstatement",
  CAPITAL: "Capital Item",
  SECURITY: "Security",
  GARBAGE_COLLECTION: "Garbage Collection",
  LANDSCAPING: "Landscaping",
  PEST_CONTROL: "Pest Control",
  INSURANCE: "Insurance",
  PROPERTY_TAX: "Property Tax / Rates",
  LEGAL_FEES: "Legal Fees",
  LICENSE_PERMIT: "Licenses & Permits",
  MARKETING: "Marketing",
  BANK_CHARGES: "Bank Charges",
  STAFF_WAGES: "Staff Wages",
  OTHER: "Other",
};
