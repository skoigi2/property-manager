/**
 * Excel export utility using SheetJS.
 * Each function accepts the data already loaded in page state — no extra API calls.
 */
import * as XLSX from "xlsx";

// ── Helpers ───────────────────────────────────────────────────────────────────

function kshs(n: number | null | undefined): number {
  return typeof n === "number" ? n : 0;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtMonth(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function setColWidths(ws: XLSX.WorkSheet, widths: number[]) {
  ws["!cols"] = widths.map((w) => ({ wch: w }));
}

function writeFile(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename);
}

function buildSheet(headers: string[], rows: (string | number | null)[][]): XLSX.WorkSheet {
  const data = [headers, ...rows];
  return XLSX.utils.aoa_to_sheet(data);
}

/** Return a currency label suffix like " (USD)" or "" if currency is unknown */
function currLabel(currency?: string | null): string {
  return currency ? ` (${currency})` : "";
}

// ── Income ────────────────────────────────────────────────────────────────────

const INCOME_TYPE_LABEL: Record<string, string> = {
  LONGTERM_RENT: "Rent", SERVICE_CHARGE: "Service Charge",
  DEPOSIT: "Deposit", AIRBNB: "Airbnb",
  UTILITY_RECOVERY: "Utility Recovery", OTHER: "Other",
};

export function exportIncome(entries: any[], month: Date, currency?: string, filenameLabel?: string) {
  const cur = currency ?? entries[0]?.property?.currency ?? entries[0]?.unit?.property?.currency ?? "";
  const c = currLabel(cur);

  const headers = [
    "Date", "Type", "Tenant", "Unit", "Property",
    `Gross Amount${c}`, `Agent Commission${c}`, `Net Amount${c}`,
    "Agent", "Platform", "Check-in", "Check-out", "Notes",
  ];

  const rows = entries.map((e) => [
    fmtDate(e.date),
    e.type === "UTILITY_RECOVERY" && e.utilityType
      ? `Utility Recovery — ${e.utilityType === "WATER" ? "Water" : "Electricity"}`
      : INCOME_TYPE_LABEL[e.type] ?? e.type,
    e.tenant?.name ?? e.tenantName ?? "",
    e.unit?.unitNumber ?? "",
    e.property?.name ?? e.unit?.property?.name ?? "",
    kshs(e.grossAmount),
    kshs(e.agentCommission),
    kshs(e.grossAmount) - kshs(e.agentCommission),
    e.agentName ?? "",
    e.platform ?? "",
    fmtDate(e.checkIn),
    fmtDate(e.checkOut),
    e.notes ?? "",
  ]);

  const ws = buildSheet(headers, rows);
  setColWidths(ws, [14, 16, 22, 10, 20, 20, 22, 18, 12, 14, 14, 14, 30]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Income");
  writeFile(wb, `Income-${filenameLabel ?? fmtMonth(month).replace(" ", "-")}.xlsx`);
}

// ── Expenses ──────────────────────────────────────────────────────────────────

const CAT_LABEL: Record<string, string> = {
  SERVICE_CHARGE: "Service Charge", MANAGEMENT_FEE: "Management Fee",
  WIFI: "Wi-Fi", WATER: "Water", ELECTRICITY: "Electricity",
  CLEANER: "Cleaner", CONSUMABLES: "Consumables", MAINTENANCE: "Maintenance",
  REINSTATEMENT: "Reinstatement", CAPITAL: "Capital Item", OTHER: "Other",
};

export function exportExpenses(entries: any[], month: Date, currency?: string, filenameLabel?: string) {
  const cur = currency ?? entries[0]?.property?.currency ?? "";
  const c = currLabel(cur);
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Summary (one row per expense) ──────────────────────────────
  const summaryHeaders = [
    "Date", "Category", "Description", "Vendor", "Property", "Scope", "Units",
    `Amount${c}`, "Capital Item", "Petty Cash",
    "Overall Payment Status", `Taxable Amount${c}`,
  ];

  const summaryRows = entries.map((e) => {
    const units =
      e.unitAllocations?.length > 0
        ? e.unitAllocations.map((a: any) => a.unit?.unitNumber ?? a.unitId).join(", ")
        : (e.unit?.unitNumber ?? "");

    const payStatus = (() => {
      if (!e.lineItems?.length) return "";
      const s = new Set(e.lineItems.map((i: any) => i.paymentStatus));
      if (s.size === 1 && s.has("PAID")) return "Paid";
      if (s.size === 1 && s.has("UNPAID")) return "Unpaid";
      return "Partial";
    })();

    const taxableAmt = (e.lineItems ?? [])
      .filter((i: any) => i.isVatable)
      .reduce((s: number, i: any) => s + kshs(i.amount), 0);

    return [
      fmtDate(e.date),
      CAT_LABEL[e.category] ?? e.category,
      e.description ?? "",
      e.vendor?.name ?? "",
      e.property?.name ?? "",
      e.scope ?? "",
      units,
      kshs(e.amount),
      e.isSunkCost ? "Yes" : "No",
      e.paidFromPettyCash ? "Yes" : "No",
      payStatus,
      taxableAmt || null,
    ];
  });

  const ws1 = buildSheet(summaryHeaders, summaryRows);
  setColWidths(ws1, [14, 18, 30, 22, 20, 12, 18, 18, 12, 10, 20, 20]);
  XLSX.utils.book_append_sheet(wb, ws1, "Expenses Summary");

  // ── Sheet 2: Line Items (one row per line item) ─────────────────────────
  const lineHeaders = [
    "Date", "Expense Category", "Expense Description", "Vendor", "Property", "Units",
    "Line Type", "Line Description", `Amount${c}`, "Taxable",
    "Payment Status", `Amount Paid${c}`, "Payment Reference",
  ];

  const lineRows: (string | number | null)[][] = [];
  for (const e of entries) {
    if (!e.lineItems?.length) continue;
    const units =
      e.unitAllocations?.length > 0
        ? e.unitAllocations.map((a: any) => a.unit?.unitNumber ?? a.unitId).join(", ")
        : (e.unit?.unitNumber ?? "");

    for (const item of e.lineItems) {
      lineRows.push([
        fmtDate(e.date),
        CAT_LABEL[e.category] ?? e.category,
        e.description ?? "",
        e.vendor?.name ?? "",
        e.property?.name ?? "",
        units,
        item.category[0] + item.category.slice(1).toLowerCase(),
        item.description ?? "",
        kshs(item.amount),
        item.isVatable ? "Yes" : "No",
        item.paymentStatus === "PAID"
          ? "Paid"
          : item.paymentStatus === "PARTIAL"
          ? "Partial"
          : "Unpaid",
        item.paymentStatus !== "UNPAID" ? kshs(item.amountPaid) : null,
        item.paymentReference ?? "",
      ]);
    }
  }

  if (lineRows.length > 0) {
    const ws2 = buildSheet(lineHeaders, lineRows);
    setColWidths(ws2, [14, 18, 28, 22, 20, 16, 12, 28, 16, 10, 14, 18, 24]);
    XLSX.utils.book_append_sheet(wb, ws2, "Line Items");
  }

  writeFile(wb, `Expenses-${filenameLabel ?? fmtMonth(month).replace(" ", "-")}.xlsx`);
}

// ── Petty Cash ────────────────────────────────────────────────────────────────

/**
 * Petty-cash ledger export. Receives ALL entries (the page holds full history),
 * filters to the requested range, and renders a proper ledger: an opening
 * balance carried in from before the range, a running balance per row
 * (APPROVED entries only — pending/rejected rows appear but don't move the
 * balance, mirroring the page), and closing totals.
 */
export function exportPettyCash(
  allEntries: any[],
  range: { from: Date | null; to: Date | null; label: string },
  propertyNameById: Record<string, string>,
  currency?: string,
) {
  const c = currLabel(currency);

  // Ledger order: oldest first (running balance reads top-down).
  const sorted = [...allEntries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const inRange = (d: Date) =>
    (!range.from || d >= range.from) && (!range.to || d <= range.to);

  // Opening balance = approved activity strictly before the range start.
  const openingBalance = range.from
    ? sorted.reduce((sum, e) => {
        if (new Date(e.date) >= range.from!) return sum;
        if ((e.status ?? "APPROVED") !== "APPROVED") return sum;
        return sum + (e.type === "IN" ? e.amount : -e.amount);
      }, 0)
    : 0;

  let running = openingBalance;
  const bodyRows: (string | number | null)[][] = [];
  let totalIn = 0, totalOut = 0;

  for (const e of sorted) {
    const d = new Date(e.date);
    if (!inRange(d)) continue;
    const approved = (e.status ?? "APPROVED") === "APPROVED";
    const signed = e.type === "IN" ? e.amount : -e.amount;

    if (approved) {
      running += signed;
      if (e.type === "IN") totalIn += e.amount; else totalOut += e.amount;
    }

    bodyRows.push([
      fmtDate(e.date),
      e.description ?? "",
      e.propertyId ? (propertyNameById[e.propertyId] ?? "") : "Portfolio",
      e.status ?? "APPROVED",
      // Pending/rejected amounts shown in parentheses — they don't move the balance.
      e.type === "IN" ? (approved ? e.amount : `(${e.amount})`) : null,
      e.type === "OUT" ? (approved ? e.amount : `(${e.amount})`) : null,
      approved ? running : null,
    ]);
  }

  const headers = ["Date", "Description", "Property", "Status", `In${c}`, `Out${c}`, `Running Balance${c}`];
  const rows: (string | number | null)[][] = [];
  if (range.from) {
    rows.push(["", "Opening balance", "", "", null, null, openingBalance]);
  }
  rows.push(...bodyRows);
  rows.push(["", "TOTAL", "", "", totalIn, totalOut, openingBalance + totalIn - totalOut]);

  const ws = buildSheet(headers, rows);
  setColWidths(ws, [14, 36, 20, 12, 16, 16, 20]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Petty Cash");
  writeFile(wb, `Petty-Cash-${range.label}.xlsx`);
}

// ── Tenants ───────────────────────────────────────────────────────────────────

function leaseStatusLabel(leaseEnd: string | null): string {
  if (!leaseEnd) return "TBC";
  const d = new Date(leaseEnd);
  const today = new Date();
  const diff = Math.floor((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "Expired";
  if (diff <= 60) return "Expiring Soon";
  return "Active";
}

export function exportTenants(tenants: any[], currency?: string) {
  const cur = currency ?? tenants[0]?.unit?.property?.currency ?? "";
  const c = currLabel(cur);

  const headers = [
    "Name", "Email", "Phone", "Unit", "Property",
    `Monthly Rent${c}`, `Service Charge${c}`, `Total Monthly${c}`,
    `Deposit${c}`, "Lease Start", "Lease End", "Lease Status",
    "Tenant Status", "Vacated Date",
  ];

  const rows = tenants.map((t) => [
    t.name ?? "",
    t.email ?? "",
    t.phone ?? "",
    t.unit?.unitNumber ?? "",
    t.unit?.property?.name ?? "",
    kshs(t.monthlyRent),
    kshs(t.serviceCharge),
    kshs(t.monthlyRent) + kshs(t.serviceCharge),
    kshs(t.depositAmount),
    fmtDate(t.leaseStart),
    fmtDate(t.leaseEnd),
    leaseStatusLabel(t.leaseEnd),
    t.isActive ? "Active" : "Vacated",
    fmtDate(t.vacatedDate),
  ]);

  const ws = buildSheet(headers, rows);
  setColWidths(ws, [22, 28, 16, 10, 20, 20, 22, 20, 16, 14, 14, 14, 12, 14]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tenants");
  writeFile(wb, `Tenants-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ── Arrears ───────────────────────────────────────────────────────────────────

const STAGE_LABEL: Record<string, string> = {
  INFORMAL_REMINDER: "Informal Reminder",
  DEMAND_LETTER: "Demand Letter",
  LEGAL_NOTICE: "Legal Notice",
  EVICTION: "Eviction Notice",
  RESOLVED: "Resolved",
};

export function exportArrears(cases: any[], currency?: string) {
  const cur = currency ?? cases[0]?.property?.currency ?? "";
  const c = currLabel(cur);
  const wb = XLSX.utils.book_new();

  // Sheet 1: Cases summary
  const caseHeaders = [
    "Tenant", "Email", "Phone", "Unit", "Property",
    "Stage", `Amount Owed${c}`, "Case Opened", "Last Updated",
    "Resolved Date", "Notes",
  ];

  const caseRows = cases.map((c_) => [
    c_.tenant?.name ?? "",
    c_.tenant?.email ?? "",
    c_.tenant?.phone ?? "",
    c_.tenant?.unit?.unitNumber ?? "",
    c_.property?.name ?? "",
    STAGE_LABEL[c_.stage] ?? c_.stage,
    kshs(c_.amountOwed),
    fmtDate(c_.createdAt),
    fmtDate(c_.updatedAt),
    fmtDate(c_.resolvedAt),
    c_.notes ?? "",
  ]);

  const ws1 = buildSheet(caseHeaders, caseRows);
  setColWidths(ws1, [22, 28, 16, 10, 20, 20, 18, 14, 14, 14, 36]);
  XLSX.utils.book_append_sheet(wb, ws1, "Arrears Cases");

  // Sheet 2: Escalation history
  const escHeaders = ["Tenant", "Unit", "Property", "Stage", "Date", "Notes"];
  const escRows: (string | number | null)[][] = [];

  for (const c_ of cases) {
    for (const esc of c_.escalations ?? []) {
      escRows.push([
        c_.tenant?.name ?? "",
        c_.tenant?.unit?.unitNumber ?? "",
        c_.property?.name ?? "",
        STAGE_LABEL[esc.stage] ?? esc.stage,
        fmtDate(esc.createdAt),
        esc.notes ?? "",
      ]);
    }
  }

  if (escRows.length > 0) {
    const ws2 = buildSheet(escHeaders, escRows);
    setColWidths(ws2, [22, 10, 20, 20, 14, 40]);
    XLSX.utils.book_append_sheet(wb, ws2, "Escalation History");
  }

  writeFile(wb, `Arrears-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ── Maintenance ───────────────────────────────────────────────────────────────

const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent",
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open", IN_PROGRESS: "In Progress",
  AWAITING_PARTS: "Awaiting Parts", DONE: "Done", CANCELLED: "Cancelled",
};

const MAINT_CAT_LABEL: Record<string, string> = {
  PLUMBING: "Plumbing", ELECTRICAL: "Electrical", STRUCTURAL: "Structural",
  APPLIANCE: "Appliance", PAINTING: "Painting", CLEANING: "Cleaning",
  SECURITY: "Security", PEST_CONTROL: "Pest Control", OTHER: "Other",
};

export function exportMaintenance(jobs: any[], currency?: string) {
  const cur = currency ?? jobs[0]?.property?.currency ?? "";
  const c = currLabel(cur);

  const headers = [
    "Title", "Category", "Priority", "Status", "Property", "Unit",
    "Reported By", "Reported Date", "Scheduled Date", "Completed Date",
    `Cost${c}`, "Assigned To", "Tenant Request", "Emergency", "Notes",
  ];

  const rows = jobs.map((j) => [
    j.title ?? "",
    MAINT_CAT_LABEL[j.category] ?? j.category ?? "",
    PRIORITY_LABEL[j.priority] ?? j.priority ?? "",
    STATUS_LABEL[j.status] ?? j.status ?? "",
    j.property?.name ?? "",
    j.unit?.unitNumber ?? "",
    j.reportedBy ?? "",
    fmtDate(j.reportedDate),
    fmtDate(j.scheduledDate),
    fmtDate(j.completedDate),
    typeof j.cost === "number" ? j.cost : null,
    j.assignedTo ?? "",
    j.submittedViaPortal ? "Yes" : "No",
    j.isEmergency ? "Yes" : "No",
    j.notes ?? "",
  ]);

  const ws = buildSheet(headers, rows);
  setColWidths(ws, [28, 14, 10, 14, 20, 10, 20, 14, 14, 14, 14, 20, 14, 10, 36]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Maintenance Jobs");
  writeFile(wb, `Maintenance-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ── Annual Summary ────────────────────────────────────────────────────────────

export function exportAnnualSummary(months: any[], year: string, currency?: string) {
  const c = currLabel(currency);
  const headers = [
    "Month", `Gross Income${c}`, `Commissions${c}`,
    `Expenses${c}`, `Net Profit${c}`, "Margin (%)",
  ];

  const rows = months.map((m) => {
    const margin = m.grossIncome > 0
      ? parseFloat(((m.netProfit / m.grossIncome) * 100).toFixed(1))
      : null;
    return [
      m.label ?? `Month ${m.month}`,
      kshs(m.grossIncome),
      kshs(m.agentCommissions),
      kshs(m.totalExpenses),
      kshs(m.netProfit),
      margin,
    ];
  });

  // Totals row
  const totals = months.reduce(
    (acc: any, m: any) => ({
      gross: acc.gross + kshs(m.grossIncome),
      comm: acc.comm + kshs(m.agentCommissions),
      exp: acc.exp + kshs(m.totalExpenses),
      net: acc.net + kshs(m.netProfit),
    }),
    { gross: 0, comm: 0, exp: 0, net: 0 }
  );
  rows.push([
    "FULL YEAR",
    totals.gross, totals.comm, totals.exp, totals.net,
    totals.gross > 0 ? parseFloat(((totals.net / totals.gross) * 100).toFixed(1)) : null,
  ]);

  const ws = buildSheet(headers, rows);
  setColWidths(ws, [16, 22, 20, 18, 20, 12]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Annual ${year}`);
  writeFile(wb, `Annual-Summary-${year}.xlsx`);
}

// ── Owner Statement ───────────────────────────────────────────────────────────

export function exportOwnerStatement(statements: any[], month: string, currency?: string) {
  const wb = XLSX.utils.book_new();

  for (const stmt of statements) {
    const cur = currency ?? stmt.currency ?? "";
    const c = currLabel(cur);
    const rows: (string | number | null)[][] = [];

    // Property header rows
    rows.push([`Property: ${stmt.propertyName}`, null, null, null]);
    rows.push([`Period: ${month}`, null, null, null]);
    rows.push(["", null, null, null]);

    // Income header
    rows.push(["INCOME", null, null, null]);
    rows.push(["Tenant", "Unit", "Type", `Amount${c}`]);
    for (const line of stmt.incomeLines ?? []) {
      rows.push([
        line.tenantName ?? "",
        line.unitNumber ?? "",
        INCOME_TYPE_LABEL[line.type] ?? line.type,
        kshs(line.amount),
      ]);
    }
    rows.push(["Gross Collections", null, null, kshs(stmt.grossIncome)]);
    rows.push(["", null, null, null]);

    // Deductions
    rows.push(["DEDUCTIONS", null, null, null]);
    rows.push(["Management Fee", null, null, -kshs(stmt.managementFee)]);
    for (const exp of stmt.expenses ?? []) {
      rows.push([CAT_LABEL[exp.category] ?? exp.category, null, exp.description ?? "", -kshs(exp.amount)]);
    }
    rows.push(["Total Deductions", null, null, -(kshs(stmt.managementFee) + kshs(stmt.totalExpenses))]);
    rows.push(["", null, null, null]);

    // Net
    rows.push(["NET PAYABLE TO OWNER", null, null, kshs(stmt.netPayable)]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 20 }, { wch: 18 }];

    // Sanitise sheet name (max 31 chars, no special chars)
    const sheetName = (stmt.propertyName ?? "Property").slice(0, 31).replace(/[:\\/?*[\]]/g, "-");
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  writeFile(wb, `Owner-Statement-${month.replace(/\s/g, "-")}.xlsx`);
}

// ── Rent Roll ─────────────────────────────────────────────────────────────────

const FREQUENCY_LABEL: Record<string, string> = {
  MONTHLY: "Monthly", QUARTERLY: "Quarterly", BIANNUAL: "Bi-annual", ANNUAL: "Annual",
};

export interface RentRollRow {
  propertyName: string;
  currency?: string | null;
  unitNumber: string;
  unitType: string;
  hasDsq?: boolean;
  floor?: number | null;
  sizeSqm?: number | null;
  occupied: boolean;
  vacantSince?: string | null;
  tenantName?: string | null;
  tenantEmail?: string | null;
  tenantPhone?: string | null;
  leaseStart?: string | null;
  leaseEnd?: string | null;
  paymentFrequency?: string | null;
  monthlyRent?: number | null;
  serviceCharge?: number | null;
  depositAmount?: number | null;
  escalationRate?: number | null;
}

const UNIT_TYPE_LABEL: Record<string, string> = {
  BEDSITTER: "Bedsitter", ONE_BED: "1 Bed", TWO_BED: "2 Bed", THREE_BED: "3 Bed",
  FOUR_BED: "4 Bed", FIVE_BED: "5+ Bed", PENTHOUSE: "Penthouse", COMMERCIAL: "Commercial", OTHER: "Other",
};

/** Lease-snapshot rent roll: one row per unit, vacant units included. */
export function exportRentRoll(rows: RentRollRow[], currency?: string) {
  const cur = currency ?? rows.find((r) => r.currency)?.currency ?? "";
  const c = currLabel(cur);

  const headers = [
    "Property", "Unit", "Type", "Floor", "Size (sqm)", "Status",
    "Tenant", "Email", "Phone",
    "Lease Start", "Lease End", "Frequency",
    `Monthly Rent${c}`, `Service Charge${c}`, `Total Monthly${c}`,
    `Deposit Held${c}`, "Escalation (%)", "Vacant Since",
  ];

  const dataRows = rows.map((r) => [
    r.propertyName,
    r.unitNumber,
    (UNIT_TYPE_LABEL[r.unitType] ?? r.unitType) + (r.hasDsq ? " + DSQ" : ""),
    r.floor ?? null,
    r.sizeSqm ?? null,
    r.occupied ? "Occupied" : "Vacant",
    r.tenantName ?? "",
    r.tenantEmail ?? "",
    r.tenantPhone ?? "",
    fmtDate(r.leaseStart),
    fmtDate(r.leaseEnd),
    r.paymentFrequency ? (FREQUENCY_LABEL[r.paymentFrequency] ?? r.paymentFrequency) : "",
    r.occupied ? kshs(r.monthlyRent) : null,
    r.occupied ? kshs(r.serviceCharge) : null,
    r.occupied ? kshs(r.monthlyRent) + kshs(r.serviceCharge) : null,
    r.occupied ? kshs(r.depositAmount) : null,
    r.escalationRate ?? null,
    r.occupied ? "" : fmtDate(r.vacantSince),
  ]);

  // Totals row (occupied units only)
  const occupied = rows.filter((r) => r.occupied);
  dataRows.push([
    "TOTAL", `${rows.length} units`, "", null, null,
    `${occupied.length} occupied / ${rows.length - occupied.length} vacant`,
    "", "", "", "", "", "",
    occupied.reduce((s, r) => s + kshs(r.monthlyRent), 0),
    occupied.reduce((s, r) => s + kshs(r.serviceCharge), 0),
    occupied.reduce((s, r) => s + kshs(r.monthlyRent) + kshs(r.serviceCharge), 0),
    occupied.reduce((s, r) => s + kshs(r.depositAmount), 0),
    null, "",
  ]);

  const ws = buildSheet(headers, dataRows);
  setColWidths(ws, [20, 10, 12, 8, 10, 24, 22, 28, 16, 14, 14, 12, 18, 18, 18, 16, 14, 14]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Rent Roll");
  writeFile(wb, `Rent-Roll-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ── Forecast ──────────────────────────────────────────────────────────────────

export function exportForecast(data: {
  months: Array<{
    label: string;
    forecastedRent: number;
    projectedExpenses: number;
    netCashflow: number;
    expenseBreakdown: Array<{ description: string; category: string; amount: number; type: string; propertyName?: string }>;
  }>;
  summary: { totalForecastedRent: number; totalProjectedExpenses: number; totalNetCashflow: number };
  horizon: number;
}, currency?: string) {
  const c = currLabel(currency);
  const wb = XLSX.utils.book_new();

  // Sheet 1: Monthly Projection
  const projHeaders = [
    "Month",
    `Forecasted Income${c}`,
    `Projected Expenses${c}`,
    `Net Cashflow${c}`,
    "Margin (%)",
  ];

  const projRows: (string | number | null)[][] = data.months.map((m) => {
    const margin = m.forecastedRent > 0
      ? parseFloat(((m.netCashflow / m.forecastedRent) * 100).toFixed(1))
      : null;
    return [m.label, m.forecastedRent, m.projectedExpenses, m.netCashflow, margin];
  });

  projRows.push([
    `TOTAL (${data.horizon} months)`,
    data.summary.totalForecastedRent,
    data.summary.totalProjectedExpenses,
    data.summary.totalNetCashflow,
    data.summary.totalForecastedRent > 0
      ? parseFloat(((data.summary.totalNetCashflow / data.summary.totalForecastedRent) * 100).toFixed(1))
      : null,
  ]);

  const ws1 = buildSheet(projHeaders, projRows);
  setColWidths(ws1, [16, 22, 22, 20, 12]);
  XLSX.utils.book_append_sheet(wb, ws1, "Monthly Projection");

  // Sheet 2: Expense Breakdown
  const expHeaders = ["Month", "Description", "Category", "Type", `Amount${c}`, "Property"];
  const expRows: (string | number | null)[][] = [];

  for (const m of data.months) {
    for (const e of m.expenseBreakdown) {
      expRows.push([m.label, e.description, e.category, e.type, e.amount, e.propertyName ?? ""]);
    }
  }

  if (expRows.length > 0) {
    const ws2 = buildSheet(expHeaders, expRows);
    setColWidths(ws2, [16, 30, 20, 18, 18, 20]);
    XLSX.utils.book_append_sheet(wb, ws2, "Expense Breakdown");
  }

  writeFile(wb, `Forecast-${data.horizon}mo-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ── Vendor Statement ──────────────────────────────────────────────────────────

export function exportVendorStatement(
  statement: {
    vendor: { name: string };
    openingBalance: number;
    lines: {
      date: string; type: string; description: string; propertyName: string | null;
      reference: string | null; vatAmount: number | null;
      invoiced: number; paid: number; balance: number;
    }[];
    totals: { invoiced: number; paid: number; outstanding: number };
  },
  rangeLabel: string,
  currency?: string,
) {
  const c = currLabel(currency);

  const headers = [
    "Date", "Type", "Description", "Property", "Reference",
    `VAT${c}`, `Invoiced${c}`, `Paid${c}`, `Balance${c}`,
  ];

  const rows: (string | number | null)[][] = [
    ["", "", "Opening balance", "", "", null, null, null, statement.openingBalance],
    ...statement.lines.map((l) => [
      fmtDate(l.date),
      l.type === "INVOICE" ? "Invoice" : "Payment",
      l.description,
      l.propertyName ?? "",
      l.reference ?? "",
      l.vatAmount ?? null,
      l.type === "INVOICE" ? l.invoiced : null,
      l.type === "PAYMENT" ? l.paid : null,
      l.balance,
    ]),
    [],
    ["", "", "Totals", "", "", null, statement.totals.invoiced, statement.totals.paid, statement.totals.outstanding],
  ];

  const ws = buildSheet(headers, rows);
  setColWidths(ws, [14, 10, 34, 20, 16, 12, 16, 16, 16]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Vendor Statement");

  const safeName = statement.vendor.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-");
  writeFile(wb, `Vendor-Statement-${safeName}-${rangeLabel}.xlsx`);
}

// ── Utility statement (water / electricity paid vs unpaid) ───────────────────

export interface UtilityStatementExportRow {
  unitNumber: string;
  tenantName: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  water: { billed: number; paid: number; unpaid: number };
  electricity: { billed: number; paid: number; unpaid: number };
  totalUnpaid: number;
  unpaidInvoices: number;
  oldestUnpaidPeriod: string | null;
  notYetInvoiced: number;
  lastPaymentDate: string | null;
  invoices: {
    invoiceNumber: string; periodYear: number; periodMonth: number; dueDate: string; status: string; overdue: boolean;
    water: { billed: number; paid: number; unpaid: number };
    electricity: { billed: number; paid: number; unpaid: number };
  }[];
}

/** Two sheets: the per-tenant chase list, and every utility invoice behind it. */
export function exportUtilityStatement(
  rows: UtilityStatementExportRow[],
  opts: { propertyName: string; rangeLabel: string; currency?: string },
) {
  const c = currLabel(opts.currency);
  const headers = [
    "Unit", "Tenant", "Phone", "Email", "Status",
    `Water billed${c}`, `Water paid${c}`, `Water unpaid${c}`,
    `Electricity billed${c}`, `Electricity paid${c}`, `Electricity unpaid${c}`,
    `Total unpaid${c}`, "Unpaid invoices", "Oldest unpaid month", `Approved, not invoiced${c}`, "Last utility payment",
  ];
  const dataRows: (string | number | null)[][] = rows.map((r) => [
    r.unitNumber, r.tenantName, r.phone ?? "", r.email ?? "", r.isActive ? "Active" : "Vacated",
    r.water.billed, r.water.paid, r.water.unpaid,
    r.electricity.billed, r.electricity.paid, r.electricity.unpaid,
    r.totalUnpaid, r.unpaidInvoices, r.oldestUnpaidPeriod ?? "", r.notYetInvoiced, fmtDate(r.lastPaymentDate),
  ]);
  const sum = (f: (r: UtilityStatementExportRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  dataRows.push([
    "TOTAL", `${rows.length} tenants`, "", "", "",
    sum((r) => r.water.billed), sum((r) => r.water.paid), sum((r) => r.water.unpaid),
    sum((r) => r.electricity.billed), sum((r) => r.electricity.paid), sum((r) => r.electricity.unpaid),
    sum((r) => r.totalUnpaid), sum((r) => r.unpaidInvoices), "", sum((r) => r.notYetInvoiced), "",
  ]);
  const ws = buildSheet(headers, dataRows);
  setColWidths(ws, [8, 24, 16, 26, 10, 14, 14, 14, 16, 16, 16, 14, 12, 16, 18, 18]);

  const invHeaders = [
    "Unit", "Tenant", "Invoice", "Invoice month", "Due date", "Status", "Overdue",
    `Water billed${c}`, `Water unpaid${c}`, `Electricity billed${c}`, `Electricity unpaid${c}`,
  ];
  const invRows: (string | number | null)[][] = rows.flatMap((r) =>
    r.invoices.map((i) => [
      r.unitNumber, r.tenantName, i.invoiceNumber, `${i.periodYear}-${String(i.periodMonth).padStart(2, "0")}`,
      fmtDate(i.dueDate), i.status, i.overdue ? "Yes" : "",
      i.water.billed, i.water.unpaid, i.electricity.billed, i.electricity.unpaid,
    ]),
  );
  const wsInv = buildSheet(invHeaders, invRows);
  setColWidths(wsInv, [8, 24, 18, 14, 12, 12, 9, 14, 14, 16, 16]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Paid vs unpaid");
  XLSX.utils.book_append_sheet(wb, wsInv, "Invoices");
  const safe = opts.propertyName.replace(/[^\w\- ]+/g, "").trim() || "Property";
  writeFile(wb, `Utility-Statement-${safe}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ── Utility reconciliation (council / KPLC / fuel vs collected) ──────────────

interface UtilityReconExportRow {
  month: number;
  unitsBilled: number; unitsVacant: number; unitsCommon: number; unitsPending: number;
  unitsBulk: number | null; unitsUnaccounted: number | null;
  billed: number; supplyAllocation: number; fuelAllocation: number;
  collected: number; supplierPaid: number; fuelPaid: number; surplus: number;
  costPerUnit: number | null; avgRateCharged: number | null;
}

export function exportUtilityReconciliation(opts: {
  propertyName: string;
  year: number;
  currency?: string;
  water: { rows: UtilityReconExportRow[]; total: UtilityReconExportRow };
  electricity: { rows: UtilityReconExportRow[]; total: UtilityReconExportRow };
}) {
  const c = currLabel(opts.currency);
  const monthName = (m: number) => fmtMonth(new Date(opts.year, m - 1, 1));
  const wb = XLSX.utils.book_new();

  const waterHeaders = ["Month", "Units billed", "Vacant units", "Common areas", `Billed${c}`, `Collected${c}`, `Council paid${c}`, `Borehole surplus to owner${c}`, `Cost per unit${c}`, `Avg rate charged${c}`];
  const waterRow = (label: string, r: UtilityReconExportRow): (string | number | null)[] => [
    label, r.unitsBilled, r.unitsVacant, r.unitsCommon, r.billed, r.collected, r.supplierPaid, r.surplus, r.costPerUnit, r.avgRateCharged,
  ];
  const wsWater = buildSheet(waterHeaders, [...opts.water.rows.map((r) => waterRow(monthName(r.month), r)), waterRow("YEAR TO DATE", opts.water.total)]);
  setColWidths(wsWater, [14, 12, 12, 13, 14, 14, 14, 24, 14, 16]);
  XLSX.utils.book_append_sheet(wb, wsWater, "Water");

  const elecHeaders = [
    "Month", "KPLC bulk kWh", "Units billed kWh", "Vacant kWh", "Common kWh", "Awaiting approval kWh", "Unaccounted kWh",
    `Billed${c}`, `Collected${c}`, `Set aside KPLC${c}`, `KPLC paid${c}`, `Set aside fuel${c}`, `Fuel paid${c}`,
    `Back to owner${c}`, `Cost per kWh${c}`, `Avg rate charged${c}`,
  ];
  const elecRow = (label: string, r: UtilityReconExportRow): (string | number | null)[] => [
    label, r.unitsBulk, r.unitsBilled, r.unitsVacant, r.unitsCommon, r.unitsPending, r.unitsUnaccounted,
    r.billed, r.collected, r.supplyAllocation, r.supplierPaid, r.fuelAllocation, r.fuelPaid,
    r.surplus, r.costPerUnit, r.avgRateCharged,
  ];
  const wsElec = buildSheet(elecHeaders, [...opts.electricity.rows.map((r) => elecRow(monthName(r.month), r)), elecRow("YEAR TO DATE", opts.electricity.total)]);
  setColWidths(wsElec, [14, 14, 16, 12, 12, 20, 16, 14, 14, 16, 14, 16, 14, 16, 14, 16]);
  XLSX.utils.book_append_sheet(wb, wsElec, "Electricity");

  const safe = opts.propertyName.replace(/[^\w\- ]+/g, "").trim() || "Property";
  writeFile(wb, `Utility-Reconciliation-${safe}-${opts.year}.xlsx`);
}
