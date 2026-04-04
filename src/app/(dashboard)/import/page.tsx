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
  downloadPettyCashTemplate,
} from "@/lib/import-templates";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "tenants" | "income" | "expenses" | "petty-cash";

interface ParsedRow {
  rowIndex: number;
  data: Record<string, string>;
  errors: string[];
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

// ── Column Definitions ────────────────────────────────────────────────────────

const TENANT_COLS = [
  "Name",
  "Unit Number",
  "Property Name",
  "Monthly Rent",
  "Service Charge",
  "Deposit",
  "Lease Start",
  "Lease End",
  "Email",
  "Phone",
];

const INCOME_COLS = [
  "Date",
  "Type",
  "Unit Number",
  "Property Name",
  "Gross Amount",
  "Agent Commission",
  "Agent Name",
  "Notes",
];

const EXPENSE_COLS = [
  "Date",
  "Category",
  "Description",
  "Scope",
  "Property Name",
  "Unit Number",
  "Amount",
  "Sunk Cost",
  "Petty Cash",
];

const PC_COLS = ["Date", "Type", "Description", "Amount"];

// ── Client-side Validators ────────────────────────────────────────────────────

const VALID_INCOME_TYPES = [
  "LONGTERM_RENT",
  "SERVICE_CHARGE",
  "DEPOSIT",
  "AIRBNB",
  "UTILITY_RECOVERY",
  "OTHER",
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
  "OTHER",
];

const VALID_EXPENSE_SCOPES = ["UNIT", "PROPERTY", "PORTFOLIO"];

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
  return errors;
}

function validateIncomeRow(row: Record<string, string>): string[] {
  const errors: string[] = [];
  if (!row["Date"]?.trim()) errors.push("Date is required");
  else if (isNaN(Date.parse(row["Date"]))) errors.push("Date is not a valid date");
  if (!row["Type"]?.trim()) errors.push("Type is required");
  else if (!VALID_INCOME_TYPES.includes(row["Type"].trim().toUpperCase()))
    errors.push(`Invalid type "${row["Type"]}"`);
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
    errors.push(`Invalid scope "${row["Scope"]}"`);
  const amt = parseFloat(row["Amount"] ?? "");
  if (!row["Amount"] || isNaN(amt) || amt <= 0)
    errors.push("Amount must be a positive number");
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

          // Skip template notes rows (first column starts with "Valid")
          const firstVal = String(Object.values(row)[0] ?? "").trim();
          if (firstVal.startsWith("Valid") || firstVal.startsWith("Type must")) {
            rowIndex++;
            continue;
          }

          // Remap row keys to our expected column names
          // The xlsx columns may be the actual header names from row 1
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

// ── Row-to-API Mapper ─────────────────────────────────────────────────────────

function mapTenantRowToApi(row: Record<string, string>) {
  return {
    name: row["Name"],
    unitNumber: row["Unit Number"],
    propertyName: row["Property Name"],
    monthlyRent: row["Monthly Rent"],
    serviceCharge: row["Service Charge"],
    depositAmount: row["Deposit"],
    leaseStart: row["Lease Start"],
    leaseEnd: row["Lease End"],
    email: row["Email"],
    phone: row["Phone"],
  };
}

function mapIncomeRowToApi(row: Record<string, string>) {
  return {
    date: row["Date"],
    type: row["Type"],
    unitNumber: row["Unit Number"],
    propertyName: row["Property Name"],
    grossAmount: row["Gross Amount"],
    agentCommission: row["Agent Commission"],
    agentName: row["Agent Name"],
    notes: row["Notes"],
  };
}

function mapExpenseRowToApi(row: Record<string, string>) {
  return {
    date: row["Date"],
    category: row["Category"],
    description: row["Description"],
    scope: row["Scope"],
    propertyName: row["Property Name"],
    unitNumber: row["Unit Number"],
    amount: row["Amount"],
    sunkCost: row["Sunk Cost"],
    pettyCash: row["Petty Cash"],
  };
}

function mapPettyCashRowToApi(row: Record<string, string>) {
  return {
    date: row["Date"],
    type: row["Type"],
    description: row["Description"],
    amount: row["Amount"],
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
}: ImportSectionProps) {
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const [serverErrorsExpanded, setServerErrorsExpanded] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        body: JSON.stringify({ rows: validRows.map((r) => mapRowToApi(r.data)) }),
      });
      const data = await res.json();
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
            <p className="text-sm font-medium text-header font-sans">
              Step 1 — Download Template
            </p>
            <p className="text-sm text-gray-500 font-sans mt-0.5">{description}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={onDownloadTemplate}>
            <Download size={14} className="mr-1.5" />
            Download {templateName} Template
          </Button>
        </div>
      </Card>

      {/* Step 2 — Upload */}
      <Card className="border border-gray-100">
        <p className="text-sm font-medium text-header font-sans mb-3">
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
          <p className="text-sm text-gray-500 font-sans text-center">
            Drag & drop your Excel file here, or click to browse
          </p>
          {fileName && (
            <p className="text-xs text-gray-400 font-mono">{fileName}</p>
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
              <span className="text-sm text-gray-600 font-sans">
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
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-red-50 text-sm font-sans text-red-700 hover:bg-red-100 transition-colors"
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
                        <p className="text-xs font-medium text-gray-700 font-sans">
                          Row {row.rowIndex}
                        </p>
                        <ul className="mt-0.5 space-y-0.5">
                          {row.errors.map((e, ei) => (
                            <li key={ei} className="text-xs text-red-600 font-sans">
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
            <p className="text-sm font-medium text-header font-sans">
              Preview{" "}
              <span className="text-gray-400 font-normal">
                (showing first {Math.min(50, parsedRows.length)} rows)
              </span>
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-sans">
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
            <p className="text-sm text-gray-500 font-sans">No valid rows to import.</p>
          ) : (
            <Button
              onClick={handleImport}
              disabled={importing || validRows.length === 0}
            >
              {importing ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Importing…
                </>
              ) : (
                <>
                  <Upload size={15} className="mr-1.5" />
                  Import {validRows.length} valid row{validRows.length !== 1 ? "s" : ""}
                </>
              )}
            </Button>
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
            <p className="text-sm font-medium text-green-700 font-sans">
              {result.imported} record{result.imported !== 1 ? "s" : ""} imported successfully
            </p>
          </div>

          {result.skipped > 0 && (
            <p className="text-sm text-gray-500 font-sans">
              {result.skipped} skipped (duplicates or errors)
            </p>
          )}

          {result.errors.length > 0 && (
            <div className="border border-red-100 rounded-lg overflow-hidden">
              <button
                onClick={() => setServerErrorsExpanded((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-red-50 text-sm font-sans text-red-700 hover:bg-red-100 transition-colors"
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
                      <span className="text-xs text-gray-400 font-mono shrink-0">
                        Row {e.row}
                      </span>
                      <span className="text-xs text-red-600 font-sans">{e.reason}</span>
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
    ["tenants", "Tenants", Users],
    ["income", "Income", TrendingUp],
    ["expenses", "Expenses", Receipt],
    ["petty-cash", "Petty Cash", Wallet],
  ];

  return (
    <div>
      <Header title="Data Import" userName={session?.user?.name ?? session?.user?.email} role={session?.user?.role} />
      <div className="page-container space-y-5">
        {/* Info banner */}
        <Card className="bg-blue-50 border border-blue-100">
          <div className="flex gap-3">
            <Info size={18} className="text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-800 font-sans">How to import</p>
              <p className="text-sm text-blue-600 font-sans">
                1. Download the template &middot; 2. Fill it in &middot; 3. Upload and
                preview &middot; 4. Confirm import. Duplicate records are automatically
                skipped.
              </p>
            </div>
          </div>
        </Card>

        {/* Tab bar */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-sans font-medium transition-all ${
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

        {/* Tab content */}
        {tab === "tenants" && (
          <ImportSection
            title="Import Tenants"
            description="Download the template, fill in tenant details, then upload to bulk-create tenants. Existing active tenants with the same name and unit are skipped."
            cols={TENANT_COLS}
            validate={validateTenantRow}
            apiPath="/api/import/tenants"
            onDownloadTemplate={downloadTenantsTemplate}
            templateName="Tenants"
            mapRowToApi={mapTenantRowToApi}
          />
        )}

        {tab === "income" && (
          <ImportSection
            title="Import Income"
            description="Download the template, fill in income records, then upload. Duplicate entries with the same unit, date, type and amount are skipped."
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
            description="Download the template, fill in expense records, then upload. Duplicate entries with the same date, category and amount are skipped."
            cols={EXPENSE_COLS}
            validate={validateExpenseRow}
            apiPath="/api/import/expenses"
            onDownloadTemplate={downloadExpensesTemplate}
            templateName="Expenses"
            mapRowToApi={mapExpenseRowToApi}
          />
        )}

        {tab === "petty-cash" && (
          <ImportSection
            title="Import Petty Cash"
            description="Download the template, fill in petty cash entries, then upload. Duplicate entries with the same date, type, description and amount are skipped."
            cols={PC_COLS}
            validate={validatePettyCashRow}
            apiPath="/api/import/petty-cash"
            onDownloadTemplate={downloadPettyCashTemplate}
            templateName="Petty Cash"
            mapRowToApi={mapPettyCashRowToApi}
          />
        )}
      </div>
    </div>
  );
}
