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

export function exportIncome(entries: any[], month: Date, currency?: string) {
  const cur = currency ?? entries[0]?.property?.currency ?? entries[0]?.unit?.property?.currency ?? "";
  const c = currLabel(cur);

  const headers = [
    "Date", "Type", "Tenant", "Unit", "Property",
    `Gross Amount${c}`, `Agent Commission${c}`, `Net Amount${c}`,
    "Agent", "Platform", "Check-in", "Check-out", "Notes",
  ];

  const rows = entries.map((e) => [
    fmtDate(e.date),
    INCOME_TYPE_LABEL[e.type] ?? e.type,
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
  writeFile(wb, `Income-${fmtMonth(month).replace(" ", "-")}.xlsx`);
}

// ── Expenses ──────────────────────────────────────────────────────────────────

const CAT_LABEL: Record<string, string> = {
  SERVICE_CHARGE: "Service Charge", MANAGEMENT_FEE: "Management Fee",
  WIFI: "Wi-Fi", WATER: "Water", ELECTRICITY: "Electricity",
  CLEANER: "Cleaner", CONSUMABLES: "Consumables", MAINTENANCE: "Maintenance",
  REINSTATEMENT: "Reinstatement", CAPITAL: "Capital Item", OTHER: "Other",
};

export function exportExpenses(entries: any[], month: Date, currency?: string) {
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

  writeFile(wb, `Expenses-${fmtMonth(month).replace(" ", "-")}.xlsx`);
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
