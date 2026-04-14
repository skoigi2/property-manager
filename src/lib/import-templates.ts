/**
 * Import template generator using SheetJS.
 * Each function downloads a pre-filled xlsx template with two sheets:
 *   1. "Data"         — headers, REQUIRED/optional hint row, and sample rows
 *   2. "Instructions" — column descriptions, valid values, format notes
 *
 * SheetJS community edition does not support cell colours, so required columns
 * are indicated by a "REQUIRED"/"optional" hint row (row 2) instead.
 * The parseFile() function in import/page.tsx skips this row automatically.
 */
import * as XLSX from "xlsx";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ColDef {
  header: string;    // plain column header — must match the cols[] arrays in import/page.tsx
  required: boolean; // drives the REQUIRED/optional hint row
  width?: number;    // column width in characters
}

// ── Builder ────────────────────────────────────────────────────────────────────

function buildTemplate(config: {
  cols: ColDef[];
  sampleRows: (string | number)[][];
  instructions: (string | number)[][];
  filename: string;
}) {
  const { cols, sampleRows, instructions, filename } = config;

  // ── Sheet 1: Data ──────────────────────────────────────────────────────────
  const headers = cols.map((c) => c.header);
  const hintRow = cols.map((c) => (c.required ? "REQUIRED" : "optional"));
  const aoa: (string | number)[][] = [headers, hintRow, ...sampleRows];

  const ws1 = XLSX.utils.aoa_to_sheet(aoa);
  ws1["!cols"] = cols.map((c) => ({ wch: c.width ?? 18 }));

  // ── Sheet 2: Instructions ──────────────────────────────────────────────────
  const instrHeader = ["Column", "Required?", "Format / Valid Values", "Notes"];
  const instrAoa: (string | number)[][] = [instrHeader, ...instructions];

  const ws2 = XLSX.utils.aoa_to_sheet(instrAoa);
  ws2["!cols"] = [{ wch: 24 }, { wch: 12 }, { wch: 62 }, { wch: 42 }];

  // ── Workbook ───────────────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, "Data");
  XLSX.utils.book_append_sheet(wb, ws2, "Instructions");

  XLSX.writeFile(wb, filename);
}

// ── Templates ──────────────────────────────────────────────────────────────────

export function downloadTenantsTemplate() {
  const cols: ColDef[] = [
    { header: "Name",           required: true,  width: 22 },
    { header: "Unit Number",    required: true,  width: 14 },
    { header: "Monthly Rent",   required: true,  width: 14 },
    { header: "Lease Start",    required: true,  width: 14 },
    { header: "Property Name",  required: false, width: 20 },
    { header: "Service Charge", required: false, width: 16 },
    { header: "Deposit",        required: false, width: 14 },
    { header: "Lease End",      required: false, width: 14 },
    { header: "Email",          required: false, width: 28 },
    { header: "Phone",          required: false, width: 16 },
  ];

  const sampleRows: (string | number)[][] = [
    ["Jane Smith",     "A1", 25000, "2025-01-01", "Riara One", 2500,   50000,  "2026-01-01", "jane@example.com",     "0712345678"],
    ["Ali Hassan",     "B3", 30000, "2025-03-15", "Riara One", "",     "",     "2026-03-15", "",                     "0798765432"],
    ["Apex Corp Ltd",  "G1", 85000, "2025-06-01", "Riara One", 8500,  170000, "2026-05-31", "accounts@apex.co.ke",  "0711000111"],
  ];

  const instructions: (string | number)[][] = [
    ["Name",           "Yes", "Text",         "Full legal name of the tenant or company"],
    ["Unit Number",    "Yes", "Text (e.g. A1, 2B, 101)", "Must match an existing unit in the system"],
    ["Monthly Rent",   "Yes", "Number (no commas or currency symbols)", "Rent in the property's currency"],
    ["Lease Start",    "Yes", "YYYY-MM-DD",   "Lease commencement date"],
    ["Property Name",  "No",  "Text",         "Disambiguates unit if the same number appears in multiple properties"],
    ["Service Charge", "No",  "Number",       "Monthly service charge — leave blank or 0 if none"],
    ["Deposit",        "No",  "Number",       "Security deposit amount — leave blank or 0 if none"],
    ["Lease End",      "No",  "YYYY-MM-DD",   "Leave blank for open-ended / periodic tenancies"],
    ["Email",          "No",  "Email address","Tenant contact email"],
    ["Phone",          "No",  "Phone number", "e.g. 0712345678 or +254712345678"],
  ];

  buildTemplate({ cols, sampleRows, instructions, filename: "import-template-tenants.xlsx" });
}

export function downloadIncomeTemplate() {
  const allTypes =
    "LONGTERM_RENT, SERVICE_CHARGE, DEPOSIT, AIRBNB, UTILITY_RECOVERY, OTHER, " +
    "LETTING_FEE, RENEWAL_FEE, VACANCY_FEE, SETUP_FEE_INSTALMENT, CONSULTANCY_FEE";

  const cols: ColDef[] = [
    { header: "Date",             required: true,  width: 14 },
    { header: "Type",             required: true,  width: 22 },
    { header: "Unit Number",      required: true,  width: 14 },
    { header: "Gross Amount",     required: true,  width: 14 },
    { header: "Property Name",    required: false, width: 20 },
    { header: "Tenant Name",      required: false, width: 22 },
    { header: "Agent Commission", required: false, width: 18 },
    { header: "Agent Name",       required: false, width: 20 },
    { header: "Notes",            required: false, width: 30 },
    { header: "Platform",         required: false, width: 16 },
    { header: "Check In",         required: false, width: 14 },
    { header: "Check Out",        required: false, width: 14 },
    { header: "Nightly Rate",     required: false, width: 14 },
  ];

  const sampleRows: (string | number)[][] = [
    ["2026-01-05", "LONGTERM_RENT",  "A1",       25000, "Riara One",   "Jane Smith", 0,    "",      "January rent",    "",         "",           "",           ""],
    ["2026-01-10", "AIRBNB",         "Studio 1", 18000, "Alba Gardens","",           1800, "Airbnb","4-night stay",    "AIRBNB",   "2026-01-10", "2026-01-14", 4500],
    ["2026-01-05", "SERVICE_CHARGE", "A1",        2500, "Riara One",   "Jane Smith", 0,    "",      "Jan service chg", "",         "",           "",           ""],
  ];

  const instructions: (string | number)[][] = [
    ["Date",             "Yes", "YYYY-MM-DD",    "Date income was received"],
    ["Type",             "Yes", allTypes,         "Income type — must match exactly (case-sensitive)"],
    ["Unit Number",      "Yes", "Text (e.g. A1)", "Must match an existing unit"],
    ["Gross Amount",     "Yes", "Number",         "Total amount received before any commissions"],
    ["Property Name",    "No",  "Text",           "Disambiguates unit across properties"],
    ["Tenant Name",      "No",  "Text",           "Links entry to a tenant record by name"],
    ["Agent Commission", "No",  "Number",         "Commission deducted from gross (default 0)"],
    ["Agent Name",       "No",  "Text",           "Matched against existing agent records by name"],
    ["Notes",            "No",  "Text",           "Free-text notes"],
    ["Platform",         "No",  "AIRBNB, BOOKING_COM, DIRECT, AGENT", "Short-let booking platform — AIRBNB type only"],
    ["Check In",         "No",  "YYYY-MM-DD",     "Guest check-in date — AIRBNB type only"],
    ["Check Out",        "No",  "YYYY-MM-DD",     "Guest check-out date — AIRBNB type only"],
    ["Nightly Rate",     "No",  "Number",          "Rate per night — AIRBNB type only"],
  ];

  buildTemplate({ cols, sampleRows, instructions, filename: "import-template-income.xlsx" });
}

export function downloadExpensesTemplate() {
  const validCategories =
    "SERVICE_CHARGE, MANAGEMENT_FEE, WIFI, WATER, ELECTRICITY, CLEANER, " +
    "CONSUMABLES, MAINTENANCE, REINSTATEMENT, CAPITAL, OTHER";

  const cols: ColDef[] = [
    { header: "Date",          required: true,  width: 14 },
    { header: "Category",      required: true,  width: 18 },
    { header: "Amount",        required: true,  width: 14 },
    { header: "Scope",         required: true,  width: 12 },
    { header: "Description",   required: false, width: 32 },
    { header: "Property Name", required: false, width: 20 },
    { header: "Unit Number",   required: false, width: 14 },
    { header: "Sunk Cost",     required: false, width: 12 },
    { header: "Petty Cash",    required: false, width: 12 },
    { header: "Vendor Name",   required: false, width: 24 },
  ];

  const sampleRows: (string | number)[][] = [
    ["2026-01-08", "MAINTENANCE",  4500,   "UNIT",      "Fix leaking tap",       "Riara One", "A1", "No", "No",  "ABC Plumbers"],
    ["2026-01-15", "ELECTRICITY",  12000,  "PROPERTY",  "January electricity",   "Riara One", "",   "No", "No",  "Kenya Power"],
    ["2026-01-20", "CAPITAL",      250000, "PORTFOLIO", "Backup generator purchase", "",      "",   "Yes","No",  ""],
  ];

  const instructions: (string | number)[][] = [
    ["Date",          "Yes", "YYYY-MM-DD",         "Date the expense was incurred"],
    ["Category",      "Yes", validCategories,       "Expense category — must match exactly"],
    ["Amount",        "Yes", "Number",              "Expense amount in the property's currency"],
    ["Scope",         "Yes", "UNIT, PROPERTY, PORTFOLIO", "UNIT = specific unit; PROPERTY = whole building; PORTFOLIO = all properties"],
    ["Description",   "No",  "Text",                "Short description of the expense"],
    ["Property Name", "No",  "Text",                "Required for UNIT or PROPERTY scope to identify the property"],
    ["Unit Number",   "No",  "Text",                "Required for UNIT scope"],
    ["Sunk Cost",     "No",  "Yes / No",            "Yes = capital/one-off cost excluded from P&L (default No)"],
    ["Petty Cash",    "No",  "Yes / No",            "Yes = paid from petty cash fund (default No)"],
    ["Vendor Name",   "No",  "Text",                "Matched against existing vendor records by name"],
  ];

  buildTemplate({ cols, sampleRows, instructions, filename: "import-template-expenses.xlsx" });
}

export function downloadPettyCashTemplate() {
  const cols: ColDef[] = [
    { header: "Date",          required: true,  width: 14 },
    { header: "Type",          required: true,  width: 10 },
    { header: "Description",   required: true,  width: 34 },
    { header: "Amount",        required: true,  width: 14 },
    { header: "Property Name", required: false, width: 20 },
  ];

  const sampleRows: (string | number)[][] = [
    ["2026-01-03", "OUT", "Cleaning supplies — mops and detergent", 1500,  "Riara One"],
    ["2026-01-10", "IN",  "Cash top-up from management office",     20000, "Riara One"],
  ];

  const instructions: (string | number)[][] = [
    ["Date",          "Yes", "YYYY-MM-DD",  "Date of the petty cash transaction"],
    ["Type",          "Yes", "IN, OUT",     "IN = adding funds to petty cash; OUT = spending from petty cash"],
    ["Description",   "Yes", "Text",        "What the money was used for (or where it came from for IN entries)"],
    ["Amount",        "Yes", "Number",      "Amount — always positive regardless of type"],
    ["Property Name", "No",  "Text",        "Identifies which property's petty cash fund is affected"],
  ];

  buildTemplate({ cols, sampleRows, instructions, filename: "import-template-petty-cash.xlsx" });
}

export function downloadUnitsTemplate() {
  const validTypes   = "BEDSITTER, ONE_BED, TWO_BED, THREE_BED, FOUR_BED, PENTHOUSE, COMMERCIAL, OTHER";
  const validStatus  = "ACTIVE, VACANT, LISTED, UNDER_NOTICE, MAINTENANCE, OWNER_OCCUPIED";

  const cols: ColDef[] = [
    { header: "Unit Number",   required: true,  width: 14 },
    { header: "Property Name", required: true,  width: 20 },
    { header: "Type",          required: true,  width: 16 },
    { header: "Floor",         required: false, width: 10 },
    { header: "Size (sqm)",    required: false, width: 12 },
    { header: "Monthly Rent",  required: false, width: 14 },
    { header: "Status",        required: false, width: 18 },
    { header: "Description",   required: false, width: 32 },
  ];

  const sampleRows: (string | number)[][] = [
    ["A1",  "Riara One", "BEDSITTER",  2, 32,  18000, "ACTIVE",  "Ground floor studio with garden view"],
    ["B4",  "Riara One", "TWO_BED",    4, 85,  35000, "VACANT",  ""],
    ["G1",  "Riara One", "COMMERCIAL", 1, 120, 85000, "ACTIVE",  "Ground floor office space"],
  ];

  const instructions: (string | number)[][] = [
    ["Unit Number",   "Yes", "Text (e.g. A1, 2B, 101)",  "Must be unique within the property — duplicates are skipped"],
    ["Property Name", "Yes", "Text",                      "Must exactly match an existing property name in the system"],
    ["Type",          "Yes", validTypes,                  "Unit type — must match exactly"],
    ["Floor",         "No",  "Integer (e.g. 0, 1, 2)",   "Floor number; ground floor is typically 0 or 1"],
    ["Size (sqm)",    "No",  "Number",                    "Floor area in square metres"],
    ["Monthly Rent",  "No",  "Number",                    "Target or listed monthly rent"],
    ["Status",        "No",  validStatus,                 "Unit availability status — defaults to ACTIVE if blank"],
    ["Description",   "No",  "Text",                      "Additional notes about the unit"],
  ];

  buildTemplate({ cols, sampleRows, instructions, filename: "import-template-units.xlsx" });
}

export function downloadMaintenanceTemplate() {
  const validCategories = "PLUMBING, ELECTRICAL, STRUCTURAL, APPLIANCE, PAINTING, CLEANING, SECURITY, PEST_CONTROL, OTHER";
  const validPriorities = "LOW, MEDIUM, HIGH, URGENT";
  const validStatuses   = "OPEN, IN_PROGRESS, AWAITING_PARTS, DONE, CANCELLED";

  const cols: ColDef[] = [
    { header: "Property Name",  required: true,  width: 20 },
    { header: "Title",          required: true,  width: 32 },
    { header: "Category",       required: true,  width: 16 },
    { header: "Priority",       required: true,  width: 12 },
    { header: "Status",         required: true,  width: 16 },
    { header: "Unit Number",    required: false, width: 14 },
    { header: "Description",    required: false, width: 42 },
    { header: "Reported By",    required: false, width: 20 },
    { header: "Reported Date",  required: false, width: 16 },
    { header: "Scheduled Date", required: false, width: 16 },
    { header: "Cost",           required: false, width: 12 },
    { header: "Vendor Name",    required: false, width: 24 },
    { header: "Notes",          required: false, width: 32 },
    { header: "Is Emergency",   required: false, width: 14 },
  ];

  const sampleRows: (string | number)[][] = [
    [
      "Riara One", "Leaking pipe in bathroom", "PLUMBING", "HIGH", "OPEN",
      "A1", "Water seeping under sink unit", "Jane Smith",
      "2026-01-05", "2026-01-08", "", "ABC Plumbers", "", "No",
    ],
    [
      "Alba Gardens", "Replace faulty ceiling fan", "ELECTRICAL", "MEDIUM", "DONE",
      "Studio 2", "Fan sparking and making loud noise", "Manager",
      "2025-12-10", "2025-12-12", 3500, "QuickFix Electric", "Fan replaced and tested OK", "No",
    ],
    [
      "Riara One", "Crack in external wall", "STRUCTURAL", "URGENT", "IN_PROGRESS",
      "", "Large crack on north-facing external wall", "Caretaker",
      "2026-01-14", "", "", "", "Awaiting structural engineer report", "Yes",
    ],
  ];

  const instructions: (string | number)[][] = [
    ["Property Name",  "Yes", "Text",           "Must match an existing property name in the system"],
    ["Title",          "Yes", "Text",            "Short summary of the job (shown in the kanban board)"],
    ["Category",       "Yes", validCategories,   "Job category — must match exactly"],
    ["Priority",       "Yes", validPriorities,   "Job urgency — must match exactly"],
    ["Status",         "Yes", validStatuses,     "Current job status — must match exactly"],
    ["Unit Number",    "No",  "Text",            "Leave blank for property-wide / common-area jobs"],
    ["Description",    "No",  "Text",            "Full description of the problem or work required"],
    ["Reported By",    "No",  "Text",            "Name of person who reported the issue"],
    ["Reported Date",  "No",  "YYYY-MM-DD",      "Date the issue was reported — defaults to today if blank"],
    ["Scheduled Date", "No",  "YYYY-MM-DD",      "Planned date for the repair work"],
    ["Cost",           "No",  "Number",          "Actual cost if job is complete (leave blank if ongoing)"],
    ["Vendor Name",    "No",  "Text",            "Matched against existing vendor records by name"],
    ["Notes",          "No",  "Text",            "Additional notes, follow-up actions, or materials needed"],
    ["Is Emergency",   "No",  "Yes / No",        "Yes = emergency job flag (default No)"],
  ];

  buildTemplate({ cols, sampleRows, instructions, filename: "import-template-maintenance.xlsx" });
}

export function downloadVendorsTemplate() {
  const validCategories = "CONTRACTOR, SUPPLIER, UTILITY_PROVIDER, SERVICE_PROVIDER, CONSULTANT, OTHER";

  const cols: ColDef[] = [
    { header: "Name",             required: true,  width: 28 },
    { header: "Category",         required: true,  width: 20 },
    { header: "Phone",            required: false, width: 16 },
    { header: "Email",            required: false, width: 28 },
    { header: "Tax ID (KRA PIN)", required: false, width: 20 },
    { header: "Bank Details",     required: false, width: 38 },
    { header: "Notes",            required: false, width: 30 },
  ];

  const sampleRows: (string | number)[][] = [
    ["ABC Plumbers Ltd",          "CONTRACTOR",  "0722111222", "jobs@abcplumbers.co.ke", "A0123456789B", "Equity Bank | 0123456789 | ABC Plumbers Ltd", "24hr emergency callout available"],
    ["Office Supplies Co",        "SUPPLIER",    "",           "orders@officesupplies.ke","",            "",                                            "Stationery and cleaning consumables"],
    ["Jane Wanjiku (Consultant)", "CONSULTANT",  "0733999888", "",                       "",            "",                                            "Lease advisory and tenant vetting"],
  ];

  const instructions: (string | number)[][] = [
    ["Name",             "Yes", "Text",                        "Company or individual name — duplicates (same name within your organisation) are skipped"],
    ["Category",         "Yes", validCategories,               "Vendor type — must match exactly"],
    ["Phone",            "No",  "Phone number",                "Primary contact phone"],
    ["Email",            "No",  "Email address",               "Primary contact email"],
    ["Tax ID (KRA PIN)", "No",  "Text (e.g. A0123456789B)",   "KRA PIN for tax compliance and 1099-style records"],
    ["Bank Details",     "No",  "Free text",                   "e.g. Bank Name | Account Number | Account Name"],
    ["Notes",            "No",  "Text",                        "Any additional notes about this vendor"],
  ];

  buildTemplate({ cols, sampleRows, instructions, filename: "import-template-vendors.xlsx" });
}
