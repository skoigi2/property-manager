"use client";

import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  Upload,
  Download,
  Users,
  TrendingUp,
  Receipt,
  Wallet,
  Info,
  CheckCircle2,
  AlertTriangle,
  CloudUpload,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Building2,
  Wrench,
  Store,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import {
  downloadTenantsTemplate,
  downloadIncomeTemplate,
  downloadExpensesTemplate,
  downloadRecurringExpensesTemplate,
  downloadPettyCashTemplate,
  downloadUnitsTemplate,
  downloadMaintenanceTemplate,
  downloadVendorsTemplate,
  downloadRentHistoryTemplate,
  downloadRowsAsWorkbook,
} from "@/lib/import-templates";
import { ImportHandoverModal } from "@/components/import/ImportHandoverModal";
import { PackageOpen } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "tenants" | "rent-history" | "income" | "expenses" | "recurring" | "petty-cash" | "units" | "maintenance" | "vendors" | "handover";

interface ParsedRow {
  rowIndex: number;
  data: Record<string, string>;
  errors: string[];
}

interface ImportResult {
  imported: number;
  updated?: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

// ── Column Definitions ────────────────────────────────────────────────────────

const TENANT_COLS = [
  "Name",
  "Unit Number",
  "Monthly Rent",
  "Lease Start",
  "Property Name",
  "Service Charge",
  "Deposit",
  "Lease End",
  "Email",
  "Phone",
  "Payment Frequency",
  "Escalation Rate",
  "Parking Fee",
  "Deposit Received",
  "Deposit Received Date",
  "Notes",
];

const RENT_HISTORY_COLS = [
  "Tenant Name",
  "Unit Number",
  "Monthly Rent",
  "Effective Date",
  "Property Name",
  "Reason",
];

const INCOME_COLS = [
  "Date",
  "Type",
  "Unit Number",
  "Gross Amount",
  "Property Name",
  "Tenant Name",
  "Agent Commission",
  "Agent Name",
  "Notes",
  "Platform",
  "Check In",
  "Check Out",
  "Nightly Rate",
];

const EXPENSE_COLS = [
  "Date",
  "Category",
  "Amount",
  "Quantity",
  "Unit",
  "Unit Rate",
  "Scope",
  "Description",
  "Property Name",
  "Unit Number",
  "Sunk Cost",
  "Petty Cash",
  "Vendor Name",
  "Amount Paid",
  "Due Date",
  "VAT Amount",
  "Discount",
  "Payment Method",
  "Payment Reference",
  "Payment Date",
  "Notes",
  "ID",
];

const PC_COLS = ["Date", "Type", "Description", "Amount", "Property Name", "Receipt Ref"];

const RECUR_COLS = [
  "Description",
  "Category",
  "Amount",
  "Scope",
  "Frequency",
  "Next Due Date",
  "Property Name",
  "Unit Number",
  "Vendor Name",
  "Active",
];
const VALID_FREQUENCIES = ["MONTHLY", "QUARTERLY", "BIANNUAL", "ANNUAL"];

const UNIT_COLS = [
  "Unit Number",
  "Property Name",
  "Type",
  "Floor",
  "Size (sqm)",
  "Monthly Rent",
  "Status",
  "Description",
];

const MAINTENANCE_COLS = [
  "Property Name",
  "Title",
  "Category",
  "Priority",
  "Status",
  "Unit Number",
  "Description",
  "Reported By",
  "Reported Date",
  "Scheduled Date",
  "Cost",
  "Vendor Name",
  "Notes",
  "Is Emergency",
];

const VENDOR_COLS = [
  "Name",
  "Category",
  "Phone",
  "Email",
  "Tax ID (KRA PIN)",
  "Bank Details",
  "Notes",
];

// ── Client-side Validators ────────────────────────────────────────────────────

const VALID_INCOME_TYPES = [
  "LONGTERM_RENT",
  "SERVICE_CHARGE",
  "DEPOSIT",
  "AIRBNB",
  "UTILITY_RECOVERY",
  "OTHER",
  "LETTING_FEE",
  "RENEWAL_FEE",
  "VACANCY_FEE",
  "SETUP_FEE_INSTALMENT",
  "CONSULTANCY_FEE",
];

const VALID_EXPENSE_CATEGORIES = [
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
  "POOL",
  "GENERATOR",
  "ELEVATOR",
  "HVAC",
  "GAS",
  "INSURANCE",
  "PROPERTY_TAX",
  "LEGAL_FEES",
  "LICENSE_PERMIT",
  "MARKETING",
  "BANK_CHARGES",
  "STAFF_WAGES",
  "OTHER",
];

const VALID_EXPENSE_SCOPES = ["UNIT", "PROPERTY", "PORTFOLIO"];

const VALID_UNIT_TYPES = [
  "BEDSITTER", "ONE_BED", "TWO_BED", "THREE_BED", "FOUR_BED",
  "PENTHOUSE", "COMMERCIAL", "OTHER",
];

const VALID_MAINTENANCE_CATEGORIES = [
  "PLUMBING", "ELECTRICAL", "STRUCTURAL", "APPLIANCE",
  "PAINTING", "CLEANING", "SECURITY", "PEST_CONTROL", "OTHER",
];

const VALID_MAINTENANCE_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const VALID_MAINTENANCE_STATUSES = [
  "OPEN", "IN_PROGRESS", "AWAITING_PARTS", "DONE", "CANCELLED",
];

const VALID_VENDOR_CATEGORIES = [
  "CONTRACTOR", "SUPPLIER", "UTILITY_PROVIDER",
  "SERVICE_PROVIDER", "CONSULTANT", "OTHER",
];

const VALID_PAYMENT_FREQUENCIES = ["MONTHLY", "QUARTERLY", "BIANNUAL", "ANNUAL"];

function validateTenantRow(row: Record<string, string>): string[] {
  const errors: string[] = [];
  if (!row["Name"]?.trim()) errors.push("Name is required");
  if (!row["Unit Number"]?.trim()) errors.push("Unit Number is required");
  const rent = parseFloat(row["Monthly Rent"] ?? "");
  if (!row["Monthly Rent"] || isNaN(rent) || rent <= 0)
    errors.push("Monthly Rent must be a positive number");
  if (!row["Lease Start"]?.trim()) errors.push("Lease Start is required");
  else if (isNaN(Date.parse(row["Lease Start"])))
    errors.push("Lease Start is not a valid date");
  const freq = row["Payment Frequency"]?.trim()?.toUpperCase();
  if (freq && !VALID_PAYMENT_FREQUENCIES.includes(freq))
    errors.push(`Invalid Payment Frequency "${row["Payment Frequency"]}" — must be one of: ${VALID_PAYMENT_FREQUENCIES.join(", ")}`);
  return errors;
}

function validateRentHistoryRow(row: Record<string, string>): string[] {
  const errors: string[] = [];
  if (!row["Tenant Name"]?.trim()) errors.push("Tenant Name is required");
  if (!row["Unit Number"]?.trim()) errors.push("Unit Number is required");
  const rent = parseFloat(row["Monthly Rent"] ?? "");
  if (!row["Monthly Rent"] || isNaN(rent) || rent <= 0)
    errors.push("Monthly Rent must be a positive number");
  if (!row["Effective Date"]?.trim()) errors.push("Effective Date is required");
  else if (isNaN(Date.parse(row["Effective Date"])))
    errors.push("Effective Date is not a valid date");
  return errors;
}

function validateIncomeRow(row: Record<string, string>): string[] {
  const errors: string[] = [];
  if (!row["Date"]?.trim()) errors.push("Date is required");
  else if (isNaN(Date.parse(row["Date"]))) errors.push("Date is not a valid date");
  if (!row["Type"]?.trim()) errors.push("Type is required");
  else if (!VALID_INCOME_TYPES.includes(row["Type"].trim().toUpperCase()))
    errors.push(`Invalid type "${row["Type"]}" — must be one of: ${VALID_INCOME_TYPES.join(", ")}`);
  if (!row["Unit Number"]?.trim()) errors.push("Unit Number is required");
  const amt = parseFloat(row["Gross Amount"] ?? "");
  if (!row["Gross Amount"] || isNaN(amt) || amt <= 0)
    errors.push("Gross Amount must be a positive number");
  return errors;
}

function validateExpenseRow(row: Record<string, string>): string[] {
  const errors: string[] = [];
  if (!row["Date"]?.trim()) errors.push("Date is required");
  else if (isNaN(Date.parse(row["Date"]))) errors.push("Date is not a valid date");
  if (!row["Category"]?.trim()) errors.push("Category is required");
  else if (!VALID_EXPENSE_CATEGORIES.includes(row["Category"].trim().toUpperCase()))
    errors.push(`Invalid category "${row["Category"]}"`);
  const scope = row["Scope"]?.trim()?.toUpperCase();
  if (!scope) errors.push("Scope is required");
  else if (!VALID_EXPENSE_SCOPES.includes(scope))
    errors.push(`Invalid scope "${row["Scope"]}" — must be UNIT, PROPERTY or PORTFOLIO`);
  // Qty × rate: when both are given, Amount may be blank (it is derived).
  const qtyStr = String(row["Quantity"] ?? "").trim();
  const rateStr = String(row["Unit Rate"] ?? "").trim();
  const qty = parseFloat(qtyStr);
  const rate = parseFloat(rateStr);
  if (qtyStr && (isNaN(qty) || qty <= 0)) errors.push("Quantity must be a positive number");
  if (rateStr && (isNaN(rate) || rate <= 0)) errors.push("Unit Rate must be a positive number");
  const hasQtyRate = !!qtyStr && !!rateStr && qty > 0 && rate > 0;
  const amt = parseFloat(row["Amount"] ?? "");
  if (!hasQtyRate && (!row["Amount"] || isNaN(amt) || amt <= 0))
    errors.push("Amount must be a positive number (or provide Quantity + Unit Rate)");
  const effAmt = hasQtyRate ? Math.round(qty * rate * 100) / 100 : amt;
  if (row["Amount Paid"]?.trim()) {
    const paid = parseFloat(row["Amount Paid"]);
    if (isNaN(paid) || paid < 0) errors.push("Amount Paid must be a non-negative number");
    else if (!isNaN(effAmt) && paid > effAmt) errors.push("Amount Paid cannot exceed Amount");
  }
  if (String(row["Discount"] ?? "").trim()) {
    const disc = parseFloat(row["Discount"]);
    if (isNaN(disc) || disc < 0) errors.push("Discount must be a non-negative number");
  }
  if (row["Due Date"]?.trim() && isNaN(Date.parse(row["Due Date"])))
    errors.push("Due Date is not a valid date");
  if (row["Payment Date"]?.trim() && isNaN(Date.parse(row["Payment Date"])))
    errors.push("Payment Date is not a valid date");
  if (row["VAT Amount"]?.trim()) {
    const vat = parseFloat(row["VAT Amount"]);
    if (isNaN(vat) || vat < 0) errors.push("VAT Amount must be a non-negative number");
  }
  return errors;
}

function validateRecurringRow(row: Record<string, string>): string[] {
  const errors: string[] = [];
  if (!row["Description"]?.trim()) errors.push("Description is required");
  if (!row["Category"]?.trim()) errors.push("Category is required");
  else if (!VALID_EXPENSE_CATEGORIES.includes(row["Category"].trim().toUpperCase()))
    errors.push(`Invalid category "${row["Category"]}"`);
  const amt = parseFloat(row["Amount"] ?? "");
  if (!row["Amount"] || isNaN(amt) || amt <= 0) errors.push("Amount must be a positive number");
  const scope = row["Scope"]?.trim()?.toUpperCase();
  if (!scope) errors.push("Scope is required");
  else if (!VALID_EXPENSE_SCOPES.includes(scope)) errors.push(`Invalid scope "${row["Scope"]}" — must be UNIT, PROPERTY or PORTFOLIO`);
  const freq = row["Frequency"]?.trim()?.toUpperCase();
  if (!freq) errors.push("Frequency is required");
  else if (!VALID_FREQUENCIES.includes(freq)) errors.push(`Invalid frequency "${row["Frequency"]}" — must be MONTHLY, QUARTERLY, BIANNUAL or ANNUAL`);
  if (!row["Next Due Date"]?.trim()) errors.push("Next Due Date is required");
  else if (isNaN(Date.parse(row["Next Due Date"]))) errors.push("Next Due Date is not a valid date");
  return errors;
}

function validatePettyCashRow(row: Record<string, string>): string[] {
  const errors: string[] = [];
  if (!row["Date"]?.trim()) errors.push("Date is required");
  else if (isNaN(Date.parse(row["Date"]))) errors.push("Date is not a valid date");
  const type = row["Type"]?.trim()?.toUpperCase();
  if (!type) errors.push("Type is required");
  else if (!["IN", "OUT"].includes(type))
    errors.push(`Type must be IN or OUT, got "${row["Type"]}"`);
  if (!row["Description"]?.trim()) errors.push("Description is required");
  const amt = parseFloat(row["Amount"] ?? "");
  if (!row["Amount"] || isNaN(amt) || amt <= 0)
    errors.push("Amount must be a positive number");
  return errors;
}

function validateUnitRow(row: Record<string, string>): string[] {
  const errors: string[] = [];
  if (!row["Unit Number"]?.trim()) errors.push("Unit Number is required");
  if (!row["Property Name"]?.trim()) errors.push("Property Name is required");
  const type = row["Type"]?.trim()?.toUpperCase();
  if (!type) errors.push("Type is required");
  else if (!VALID_UNIT_TYPES.includes(type))
    errors.push(`Invalid Type "${row["Type"]}" — must be one of: ${VALID_UNIT_TYPES.join(", ")}`);
  return errors;
}

function validateMaintenanceRow(row: Record<string, string>): string[] {
  const errors: string[] = [];
  if (!row["Property Name"]?.trim()) errors.push("Property Name is required");
  if (!row["Title"]?.trim()) errors.push("Title is required");
  const category = row["Category"]?.trim()?.toUpperCase();
  if (!category) errors.push("Category is required");
  else if (!VALID_MAINTENANCE_CATEGORIES.includes(category))
    errors.push(`Invalid Category "${row["Category"]}" — must be one of: ${VALID_MAINTENANCE_CATEGORIES.join(", ")}`);
  const priority = row["Priority"]?.trim()?.toUpperCase();
  if (!priority) errors.push("Priority is required");
  else if (!VALID_MAINTENANCE_PRIORITIES.includes(priority))
    errors.push(`Invalid Priority "${row["Priority"]}" — must be one of: ${VALID_MAINTENANCE_PRIORITIES.join(", ")}`);
  const status = row["Status"]?.trim()?.toUpperCase();
  if (!status) errors.push("Status is required");
  else if (!VALID_MAINTENANCE_STATUSES.includes(status))
    errors.push(`Invalid Status "${row["Status"]}" — must be one of: ${VALID_MAINTENANCE_STATUSES.join(", ")}`);
  return errors;
}

function validateVendorRow(row: Record<string, string>): string[] {
  const errors: string[] = [];
  if (!row["Name"]?.trim()) errors.push("Name is required");
  const category = row["Category"]?.trim()?.toUpperCase();
  if (!category) errors.push("Category is required");
  else if (!VALID_VENDOR_CATEGORIES.includes(category))
    errors.push(`Invalid Category "${row["Category"]}" — must be one of: ${VALID_VENDOR_CATEGORIES.join(", ")}`);
  return errors;
}

// ── File Parser ───────────────────────────────────────────────────────────────

function parseFile(
  file: File,
  cols: string[]
): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: "array" });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const jsonRows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, {
          raw: false,
          defval: "",
        });

        const parsed: ParsedRow[] = [];
        let rowIndex = 1;

        for (const row of jsonRows) {
          // Skip rows where all fields are empty
          const values = Object.values(row);
          if (values.every((v) => !v || String(v).trim() === "")) {
            rowIndex++;
            continue;
          }

          // Skip template helper rows (hint row + old-style note rows)
          const firstVal = String(Object.values(row)[0] ?? "").trim();
          if (
            firstVal === "REQUIRED" ||
            firstVal === "optional" ||
            firstVal.startsWith("Valid") ||
            firstVal.startsWith("Type must")
          ) {
            rowIndex++;
            continue;
          }

          // Remap row keys to our expected column names
          const mapped: Record<string, string> = {};
          for (const col of cols) {
            mapped[col] = String(row[col] ?? "").trim();
          }

          parsed.push({ rowIndex, data: mapped, errors: [] });
          rowIndex++;
        }

        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

// ── Row-to-API Mappers ────────────────────────────────────────────────────────

function mapTenantRowToApi(row: Record<string, string>) {
  return {
    name:             row["Name"],
    unitNumber:       row["Unit Number"],
    propertyName:     row["Property Name"],
    monthlyRent:      row["Monthly Rent"],
    serviceCharge:    row["Service Charge"],
    depositAmount:    row["Deposit"],
    leaseStart:       row["Lease Start"],
    leaseEnd:         row["Lease End"],
    email:            row["Email"],
    phone:            row["Phone"],
    paymentFrequency: row["Payment Frequency"],
    escalationRate:   row["Escalation Rate"],
    parkingFee:       row["Parking Fee"],
    depositReceived:  row["Deposit Received"],
    depositReceivedDate: row["Deposit Received Date"],
    notes:            row["Notes"],
  };
}

function mapRentHistoryRowToApi(row: Record<string, string>) {
  return {
    tenantName:    row["Tenant Name"],
    unitNumber:    row["Unit Number"],
    propertyName:  row["Property Name"],
    monthlyRent:   row["Monthly Rent"],
    effectiveDate: row["Effective Date"],
    reason:        row["Reason"],
  };
}

function mapIncomeRowToApi(row: Record<string, string>) {
  return {
    date:            row["Date"],
    type:            row["Type"],
    unitNumber:      row["Unit Number"],
    propertyName:    row["Property Name"],
    grossAmount:     row["Gross Amount"],
    tenantName:      row["Tenant Name"],
    agentCommission: row["Agent Commission"],
    agentName:       row["Agent Name"],
    notes:           row["Notes"],
    platform:        row["Platform"],
    checkIn:         row["Check In"],
    checkOut:        row["Check Out"],
    nightlyRate:     row["Nightly Rate"],
  };
}

function mapExpenseRowToApi(row: Record<string, string>) {
  return {
    date:         row["Date"],
    category:     row["Category"],
    description:  row["Description"],
    scope:        row["Scope"],
    propertyName: row["Property Name"],
    unitNumber:   row["Unit Number"],
    amount:       row["Amount"],
    quantity:     row["Quantity"],
    unit:         row["Unit"],
    unitRate:     row["Unit Rate"],
    sunkCost:     row["Sunk Cost"],
    pettyCash:    row["Petty Cash"],
    vendorName:   row["Vendor Name"],
    amountPaid:   row["Amount Paid"],
    dueDate:      row["Due Date"],
    vatAmount:    row["VAT Amount"],
    discount:     row["Discount"],
    paymentMethod:    row["Payment Method"],
    paymentReference: row["Payment Reference"],
    paymentDate:      row["Payment Date"],
    notes:            row["Notes"],
    id:               row["ID"],
  };
}

/**
 * Download every accessible expense pre-filled into the import template
 * (with the ID column populated). Editing this file and re-uploading it with
 * "Update existing records" on updates rows by ID — no duplicates.
 */
async function exportExistingExpenses() {
  const res = await fetch("/api/import/expenses/export");
  if (!res.ok) {
    alert("Could not export existing expenses. Please try again.");
    return;
  }
  const data = await res.json();
  const rows: Record<string, string | number>[] = data.rows ?? [];
  if (rows.length === 0) {
    alert("There are no existing expenses to export yet.");
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  downloadRowsAsWorkbook(EXPENSE_COLS, rows, `expenses-export-${stamp}.xlsx`);
}

function mapRecurringRowToApi(row: Record<string, string>) {
  return {
    description:  row["Description"],
    category:     row["Category"],
    amount:       row["Amount"],
    scope:        row["Scope"],
    frequency:    row["Frequency"],
    nextDueDate:  row["Next Due Date"],
    propertyName: row["Property Name"],
    unitNumber:   row["Unit Number"],
    vendorName:   row["Vendor Name"],
    isActive:     row["Active"],
  };
}

function mapPettyCashRowToApi(row: Record<string, string>) {
  return {
    date:         row["Date"],
    type:         row["Type"],
    description:  row["Description"],
    amount:       row["Amount"],
    propertyName: row["Property Name"],
    receiptRef:   row["Receipt Ref"],
  };
}

function mapUnitRowToApi(row: Record<string, string>) {
  return {
    unitNumber:   row["Unit Number"],
    propertyName: row["Property Name"],
    type:         row["Type"],
    floor:        row["Floor"],
    sizeSqm:      row["Size (sqm)"],
    monthlyRent:  row["Monthly Rent"],
    status:       row["Status"],
    description:  row["Description"],
  };
}

function mapMaintenanceRowToApi(row: Record<string, string>) {
  return {
    propertyName:  row["Property Name"],
    title:         row["Title"],
    category:      row["Category"],
    priority:      row["Priority"],
    status:        row["Status"],
    unitNumber:    row["Unit Number"],
    description:   row["Description"],
    reportedBy:    row["Reported By"],
    reportedDate:  row["Reported Date"],
    scheduledDate: row["Scheduled Date"],
    cost:          row["Cost"],
    vendorName:    row["Vendor Name"],
    notes:         row["Notes"],
    isEmergency:   row["Is Emergency"],
  };
}

function mapVendorRowToApi(row: Record<string, string>) {
  return {
    name:        row["Name"],
    category:    row["Category"],
    phone:       row["Phone"],
    email:       row["Email"],
    taxId:       row["Tax ID (KRA PIN)"],
    bankDetails: row["Bank Details"],
    notes:       row["Notes"],
  };
}

// ── ImportSection Component ───────────────────────────────────────────────────

interface ImportSectionProps {
  title: string;
  description: string;
  cols: string[];
  validate: (row: Record<string, string>) => string[];
  apiPath: string;
  onDownloadTemplate: () => void;
  templateName: string;
  mapRowToApi: (row: Record<string, string>) => Record<string, string>;
  /** When true, render an "Update existing records" toggle that sends `mode: "upsert"`. */
  supportsUpsert?: boolean;
  /**
   * When provided, renders an "Export existing" button that downloads current
   * records pre-filled into the import template (including a stable ID column),
   * so a re-upload in upsert mode updates rows by ID with no duplicates.
   */
  onExportExisting?: () => Promise<void>;
}

function ImportSection({
  title,
  description,
  cols,
  validate,
  apiPath,
  onDownloadTemplate,
  templateName,
  mapRowToApi,
  supportsUpsert = false,
  onExportExisting,
}: ImportSectionProps) {
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const [serverErrorsExpanded, setServerErrorsExpanded] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [upsertMode, setUpsertMode] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportExisting = useCallback(async () => {
    if (!onExportExisting) return;
    setExporting(true);
    try {
      await onExportExisting();
    } finally {
      setExporting(false);
    }
  }, [onExportExisting]);

  const processFile = useCallback(
    async (file: File) => {
      setResult(null);
      setFileName(file.name);
      try {
        const rows = await parseFile(file, cols);
        const withValidation = rows.map((r) => ({
          ...r,
          errors: validate(r.data),
        }));
        setParsedRows(withValidation);
      } catch {
        setParsedRows([]);
      }
    },
    [cols, validate]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const validRows = parsedRows.filter((r) => r.errors.length === 0);
  const errorRows = parsedRows.filter((r) => r.errors.length > 0);

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: validRows.map((r) => mapRowToApi(r.data)),
          ...(supportsUpsert && upsertMode ? { mode: "upsert" } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Server returned a non-2xx — surface the actual error message.
        setResult({
          imported: 0,
          skipped: 0,
          errors: [{ row: 0, reason: data?.detail || data?.error || `Server error (${res.status})` }],
        });
        return;
      }
      setResult(data);
    } catch {
      setResult({ imported: 0, skipped: 0, errors: [{ row: 0, reason: "Network error" }] });
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setParsedRows([]);
    setResult(null);
    setFileName(null);
    setErrorsExpanded(false);
    setServerErrorsExpanded(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      {/* Step 1 — Download Template */}
      <Card className="border border-gray-100">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
            <Download size={16} className="text-green-600" />
          </div>
          <div className="flex-1">
            <p className="text-body font-medium text-header ">
              Step 1 — Download Template
            </p>
            <p className="text-body text-gray-500 mt-0.5">{description}</p>
          </div>
          <div className="flex flex-col items-stretch gap-2 shrink-0">
            <Button variant="secondary" size="sm" onClick={onDownloadTemplate}>
              <Download size={14} className="mr-1.5" />
              Download {templateName} Template
            </Button>
            {onExportExisting && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExportExisting}
                disabled={exporting}
                title="Download your existing records pre-filled into the template (with IDs) so you can edit and re-upload them as updates"
              >
                {exporting ? (
                  <>
                    <Spinner size="sm" className="mr-1.5" />
                    Exporting…
                  </>
                ) : (
                  <>
                    <Download size={14} className="mr-1.5" />
                    Export existing
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
        {onExportExisting && (
          <p className="text-caption text-gray-400 mt-2 pl-11">
            To <span className="font-medium">edit existing records</span>, click{" "}
            <span className="font-medium">Export existing</span> to download them with their IDs,
            change values in Excel, then re-upload with <span className="font-medium">Update existing records</span> ticked.
            Rows are matched by ID, so nothing is duplicated.
          </p>
        )}
      </Card>

      {/* Step 2 — Upload */}
      <Card className="border border-gray-100">
        <p className="text-body font-medium text-header mb-3">
          Step 2 — Upload Filled Template
        </p>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors
            ${dragOver
              ? "border-gold bg-gold/5"
              : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            }
          `}
        >
          <CloudUpload
            size={28}
            className={dragOver ? "text-gold" : "text-gray-400"}
          />
          <p className="text-body text-gray-500 text-center">
            Drag & drop your Excel file here, or click to browse
          </p>
          {fileName && (
            <p className="text-caption text-gray-400 font-mono">{fileName}</p>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Summary after parsing */}
        {parsedRows.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-body text-gray-600 ">
                <span className="font-medium">{parsedRows.length}</span> rows parsed —{" "}
                <span className="text-green-600 font-medium">{validRows.length} valid</span>,{" "}
                <span className="text-red-500 font-medium">{errorRows.length} with errors</span>
              </span>
            </div>

            {/* Collapsible error summary */}
            {errorRows.length > 0 && (
              <div className="border border-red-100 rounded-lg overflow-hidden">
                <button
                  onClick={() => setErrorsExpanded((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-red-50 text-body text-red-700 hover:bg-red-100 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <AlertTriangle size={14} />
                    {errorRows.length} row{errorRows.length !== 1 ? "s" : ""} have validation errors
                  </span>
                  {errorsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {errorsExpanded && (
                  <div className="divide-y divide-red-100 max-h-48 overflow-y-auto">
                    {errorRows.map((row) => (
                      <div key={row.rowIndex} className="px-4 py-2 bg-white">
                        <p className="text-caption font-medium text-gray-700 ">
                          Row {row.rowIndex}
                        </p>
                        <ul className="mt-0.5 space-y-0.5">
                          {row.errors.map((e, ei) => (
                            <li key={ei} className="text-caption text-red-600 ">
                              • {e}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Preview table */}
      {parsedRows.length > 0 && (
        <Card padding="none" className="border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-body font-medium text-header ">
              Preview{" "}
              <span className="text-gray-400 ">
                (showing first {Math.min(50, parsedRows.length)} rows)
              </span>
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-caption ">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="w-8 px-3 py-2 text-left text-gray-500"></th>
                  {cols.map((col) => (
                    <th
                      key={col}
                      className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {parsedRows.slice(0, 50).map((row) => (
                  <tr
                    key={row.rowIndex}
                    className={row.errors.length > 0 ? "bg-red-50" : "bg-white hover:bg-gray-50"}
                  >
                    <td className="px-3 py-2">
                      {row.errors.length > 0 ? (
                        <AlertTriangle size={13} className="text-red-400" />
                      ) : (
                        <CheckCircle2 size={13} className="text-green-500" />
                      )}
                    </td>
                    {cols.map((col) => (
                      <td
                        key={col}
                        className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[160px] truncate"
                      >
                        {row.data[col] || (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      {row.errors.length > 0 ? (
                        <div className="space-y-0.5">
                          {row.errors.slice(0, 2).map((e, ei) => (
                            <Badge key={ei} variant="red">
                              {e}
                            </Badge>
                          ))}
                          {row.errors.length > 2 && (
                            <Badge variant="red">+{row.errors.length - 2} more</Badge>
                          )}
                        </div>
                      ) : (
                        <Badge variant="green">Valid</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Import action + result */}
      {parsedRows.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {validRows.length === 0 ? (
            <p className="text-body text-gray-500 ">No valid rows to import.</p>
          ) : (
            <Button
              onClick={handleImport}
              disabled={importing || validRows.length === 0}
            >
              {importing ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  {upsertMode ? "Updating…" : "Importing…"}
                </>
              ) : (
                <>
                  <Upload size={15} className="mr-1.5" />
                  {upsertMode ? "Update" : "Import"} {validRows.length} valid row{validRows.length !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          )}

          {supportsUpsert && validRows.length > 0 && (
            <label className="flex items-center gap-2 text-body text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={upsertMode}
                onChange={(e) => setUpsertMode(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-gold focus:ring-gold/40"
              />
              Update existing records (re-upload to refresh fields)
            </label>
          )}

          <Button variant="ghost" size="sm" onClick={handleReset}>
            <RefreshCw size={13} className="mr-1.5" />
            Start fresh
          </Button>
        </div>
      )}

      {/* Import result */}
      {result && (
        <Card className="border border-gray-100 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-500 shrink-0" />
            <p className="text-body font-medium text-green-700 ">
              {result.imported} record{result.imported !== 1 ? "s" : ""} imported
              {result.updated ? `, ${result.updated} updated` : ""}
              {" "}successfully
            </p>
          </div>

          {result.skipped > 0 && (
            <p className="text-body text-gray-500 ">
              {result.skipped} skipped (duplicates or errors)
            </p>
          )}

          {result.errors.length > 0 && (
            <div className="border border-red-100 rounded-lg overflow-hidden">
              <button
                onClick={() => setServerErrorsExpanded((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-red-50 text-body text-red-700 hover:bg-red-100 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle size={14} />
                  {result.errors.length} server-side error{result.errors.length !== 1 ? "s" : ""}
                </span>
                {serverErrorsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {serverErrorsExpanded && (
                <div className="divide-y divide-red-100 max-h-48 overflow-y-auto">
                  {result.errors.map((e, i) => (
                    <div key={i} className="px-4 py-2 bg-white flex gap-3">
                      <span className="text-caption text-gray-400 font-mono shrink-0">
                        Row {e.row}
                      </span>
                      <span className="text-caption text-red-600 ">{e.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<Tab>("tenants");

  const tabs: [Tab, string, React.ElementType][] = [
    ["tenants",      "Tenants",      Users],
    ["rent-history", "Rent History", RefreshCw],
    ["income",       "Income",       TrendingUp],
    ["expenses",     "Expenses",     Receipt],
    ["recurring",    "Recurring",    RefreshCw],
    ["petty-cash",   "Petty Cash",   Wallet],
    ["units",        "Units",        Building2],
    ["maintenance",  "Maintenance",  Wrench],
    ["vendors",      "Vendors",      Store],
    ["handover",     "Handover",     PackageOpen],
  ];

  // Handover uses a single-file ZIP uploader (different from the row-based
  // ImportSection flow), so it owns its own visibility state.
  const [handoverOpen, setHandoverOpen] = useState(false);

  return (
    <div>
      <Header title="Data Import" userName={session?.user?.name ?? session?.user?.email} role={session?.user?.role} />
      <div className="page-container space-y-5">
        {/* Info banner */}
        <Card className="bg-blue-50 border border-blue-100">
          <div className="flex gap-3">
            <Info size={18} className="text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-body font-medium text-blue-800 ">How to import</p>
              <p className="text-body text-blue-600 ">
                1. Download the template &middot; 2. Fill in the Data sheet (row 2 shows which fields are required) &middot; 3. Upload and preview &middot; 4. Confirm import. Duplicate records are automatically skipped.
              </p>
            </div>
          </div>
        </Card>

        {/* Tab bar */}
        <div className="overflow-x-auto">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
            {tabs.map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-body font-medium transition-all whitespace-nowrap ${
                  tab === id
                    ? "bg-white text-header shadow-sm"
                    : "text-gray-500 hover:text-header"
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        {tab === "tenants" && (
          <ImportSection
            title="Import Tenants"
            description="Download the template, fill in tenant details, then upload to bulk-create tenants. Toggle 'Update existing records' to refresh tenants that are already in the system — useful for re-uploading after schema changes."
            cols={TENANT_COLS}
            validate={validateTenantRow}
            apiPath="/api/import/tenants"
            onDownloadTemplate={downloadTenantsTemplate}
            templateName="Tenants"
            mapRowToApi={mapTenantRowToApi}
            supportsUpsert
          />
        )}

        {tab === "rent-history" && (
          <ImportSection
            title="Import Rent History"
            description="Download the template, fill in prior lease periods, then upload. Tenants are resolved by name + unit. Toggle 'Update existing records' to overwrite rows that share the same tenant + effective date — useful when correcting historical figures."
            cols={RENT_HISTORY_COLS}
            validate={validateRentHistoryRow}
            apiPath="/api/import/rent-history"
            onDownloadTemplate={downloadRentHistoryTemplate}
            templateName="Rent History"
            mapRowToApi={mapRentHistoryRowToApi}
            supportsUpsert
          />
        )}

        {tab === "income" && (
          <ImportSection
            title="Import Income"
            description="Download the template, fill in income records, then upload. Duplicate entries with the same unit, date, type and amount are skipped. Supports all income types including Airbnb bookings."
            cols={INCOME_COLS}
            validate={validateIncomeRow}
            apiPath="/api/import/income"
            onDownloadTemplate={downloadIncomeTemplate}
            templateName="Income"
            mapRowToApi={mapIncomeRowToApi}
          />
        )}

        {tab === "expenses" && (
          <ImportSection
            title="Import Expenses"
            description="Download the template, fill in expense records, then upload. New rows that match an existing expense (same date, category, amount, property and description) are skipped. Vendor names are matched against existing vendor records. Optional columns capture VAT Amount and payment detail — Amount Paid, Due Date, Payment Method, Payment Reference, Payment Date and Notes — and populate outstanding balances. To change existing expenses (including amount, date or category), use 'Export existing' then re-upload with 'Update existing records' on — rows match by ID, never duplicate."
            cols={EXPENSE_COLS}
            validate={validateExpenseRow}
            apiPath="/api/import/expenses"
            onDownloadTemplate={downloadExpensesTemplate}
            templateName="Expenses"
            mapRowToApi={mapExpenseRowToApi}
            supportsUpsert
            onExportExisting={exportExistingExpenses}
          />
        )}

        {tab === "recurring" && (
          <ImportSection
            title="Import Recurring Expenses"
            description="Bulk-load standing costs (security, garbage, service charge, water, rates, pool, etc.) so they appear in the cash-flow forecast and are auto-applied each period. Set Frequency (MONTHLY / QUARTERLY / BIANNUAL / ANNUAL) and the Next Due Date. Duplicates (same description, category, amount, property and frequency) are skipped. Toggle 'Update existing records' to refresh next-due / amount / vendor on a re-upload."
            cols={RECUR_COLS}
            validate={validateRecurringRow}
            apiPath="/api/import/recurring-expenses"
            onDownloadTemplate={downloadRecurringExpensesTemplate}
            templateName="Recurring Expenses"
            mapRowToApi={mapRecurringRowToApi}
            supportsUpsert
          />
        )}

        {tab === "petty-cash" && (
          <ImportSection
            title="Import Petty Cash"
            description="Download the template, fill in petty cash entries, then upload. Duplicate entries (same date, type, description, amount and property) are skipped. Property Name links each entry to that property's petty cash fund; an optional Receipt Ref captures the voucher number. Toggle 'Update existing records' to refresh receipt ref / property on a re-upload."
            cols={PC_COLS}
            validate={validatePettyCashRow}
            apiPath="/api/import/petty-cash"
            onDownloadTemplate={downloadPettyCashTemplate}
            templateName="Petty Cash"
            mapRowToApi={mapPettyCashRowToApi}
            supportsUpsert
          />
        )}

        {tab === "units" && (
          <ImportSection
            title="Import Units"
            description="Download the template, fill in unit details, then upload to bulk-create units. Units with the same number in the same property are skipped. The property must already exist in the system."
            cols={UNIT_COLS}
            validate={validateUnitRow}
            apiPath="/api/import/units"
            onDownloadTemplate={downloadUnitsTemplate}
            templateName="Units"
            mapRowToApi={mapUnitRowToApi}
          />
        )}

        {tab === "maintenance" && (
          <ImportSection
            title="Import Maintenance Jobs"
            description="Download the template, fill in maintenance job details, then upload. All jobs are created (no duplicate check). Vendor names are matched against existing vendor records."
            cols={MAINTENANCE_COLS}
            validate={validateMaintenanceRow}
            apiPath="/api/import/maintenance"
            onDownloadTemplate={downloadMaintenanceTemplate}
            templateName="Maintenance"
            mapRowToApi={mapMaintenanceRowToApi}
          />
        )}

        {tab === "vendors" && (
          <ImportSection
            title="Import Vendors"
            description="Download the template, fill in vendor details, then upload to bulk-create vendor records. Vendors with the same name in your organisation are skipped."
            cols={VENDOR_COLS}
            validate={validateVendorRow}
            apiPath="/api/import/vendors"
            onDownloadTemplate={downloadVendorsTemplate}
            templateName="Vendors"
            mapRowToApi={mapVendorRowToApi}
          />
        )}

        {tab === "handover" && (
          <Card className="border border-gray-100 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
                <PackageOpen size={20} className="text-gold" />
              </div>
              <div className="flex-1">
                <p className="text-body font-semibold text-header ">Import from Handover Package</p>
                <p className="text-caption text-gray-500 mt-0.5">
                  Restores a property from a .zip handover export — pulls in property metadata, units, tenants, income, expenses, petty cash, owner invoices, and tenant documents in one shot.
                </p>
                <p className="text-caption text-gray-400 mt-2">
                  Management agreement settings must be configured manually after import.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={() => setHandoverOpen(true)}>
                <PackageOpen size={14} className="mr-1.5" /> Select ZIP and import
              </Button>
            </div>
          </Card>
        )}

        {handoverOpen && (
          <ImportHandoverModal onClose={() => setHandoverOpen(false)} />
        )}
      </div>
    </div>
  );
}
