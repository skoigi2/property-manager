/**
 * Import template generator using SheetJS.
 * Each function downloads a pre-filled xlsx template for the user to fill in.
 */
import * as XLSX from "xlsx";

function setColWidths(ws: XLSX.WorkSheet, widths: number[]) {
  ws["!cols"] = widths.map((w) => ({ wch: w }));
}

function buildAndDownload(
  headers: string[],
  sampleRow: (string | number)[],
  noteRow: string | null,
  widths: number[],
  filename: string
) {
  const aoa: (string | number)[][] = [headers, sampleRow];
  if (noteRow) aoa.push([noteRow]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  setColWidths(ws, widths);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, filename);
}

export function downloadTenantsTemplate() {
  const headers = [
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
  const sample: (string | number)[] = [
    "John Doe",
    "A1",
    "Riara One",
    25000,
    2500,
    50000,
    "2024-01-01",
    "2025-01-01",
    "john@example.com",
    "0712345678",
  ];
  const widths = [20, 14, 18, 14, 14, 14, 14, 14, 24, 14];
  buildAndDownload(headers, sample, null, widths, "import-template-tenants.xlsx");
}

export function downloadIncomeTemplate() {
  const headers = [
    "Date",
    "Type",
    "Unit Number",
    "Property Name",
    "Gross Amount",
    "Agent Commission",
    "Agent Name",
    "Notes",
  ];
  const sample: (string | number)[] = [
    "2026-01-01",
    "LONGTERM_RENT",
    "A1",
    "Riara One",
    25000,
    0,
    "",
    "",
  ];
  const note =
    "Valid types: LONGTERM_RENT, SERVICE_CHARGE, DEPOSIT, AIRBNB, UTILITY_RECOVERY, OTHER";
  const widths = [14, 18, 14, 18, 14, 16, 18, 30];
  buildAndDownload(headers, sample, note, widths, "import-template-income.xlsx");
}

export function downloadExpensesTemplate() {
  const headers = [
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
  const sample: (string | number)[] = [
    "2026-01-01",
    "MAINTENANCE",
    "Fix leaking tap",
    "UNIT",
    "Riara One",
    "A1",
    5000,
    "No",
    "No",
  ];
  const note =
    "Valid categories: SERVICE_CHARGE, MANAGEMENT_FEE, WIFI, WATER, ELECTRICITY, CLEANER, CONSUMABLES, MAINTENANCE, REINSTATEMENT, CAPITAL, OTHER | Valid scopes: UNIT, PROPERTY, PORTFOLIO";
  const widths = [14, 18, 28, 12, 18, 14, 12, 12, 12];
  buildAndDownload(headers, sample, note, widths, "import-template-expenses.xlsx");
}

export function downloadPettyCashTemplate() {
  const headers = ["Date", "Type", "Description", "Amount"];
  const sample: (string | number)[] = [
    "2026-01-01",
    "OUT",
    "Cleaning supplies",
    1500,
  ];
  const note = "Type must be IN (add funds) or OUT (spend funds)";
  const widths = [14, 10, 30, 12];
  buildAndDownload(headers, sample, note, widths, "import-template-petty-cash.xlsx");
}
