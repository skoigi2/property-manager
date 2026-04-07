import { Document, Page, View, Text } from "@react-pdf/renderer";
import { styles } from "./PdfStyles";
import type { ReportData } from "@/types/report";
import { formatCurrency } from "@/lib/currency";

const UNIT_LABEL: Record<string, string> = {
  BEDSITTER: "Bedsitter",
  ONE_BED: "1 Bed",
  TWO_BED: "2 Bed",
  THREE_BED: "3 Bed",
  FOUR_BED: "4 Bed",
  PENTHOUSE: "Penthouse",
  COMMERCIAL: "Commercial",
  OTHER: "Other",
};

const VENDOR_CATEGORY_LABEL: Record<string, string> = {
  CONTRACTOR: "Contractor",
  SUPPLIER: "Supplier",
  UTILITY_PROVIDER: "Utility",
  SERVICE_PROVIDER: "Service Provider",
  CONSULTANT: "Consultant",
  OTHER: "Other",
};

function PageFooter({ period, property, manager }: { period: string; property: string; manager: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>{property} · {period}</Text>
      <Text style={styles.footerText}>{manager}</Text>
      <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

export function ReportDocument({ data }: { data: ReportData }) {
  const fmt = (n: number) => formatCurrency(n, data.currency ?? "USD");

  const hasLongTerm = data.rentCollection.length > 0;
  const hasShortLet = data.albaPerformance.length > 0;
  const hasVendors  = (data.vendorSpend?.length ?? 0) > 0;
  const hasTax      = !!data.taxSummary?.hasAnyTax;
  const hasAlerts   = data.alerts.length > 0;

  // Dynamic section numbering
  let n = 0;
  const SEC = {
    exec:      ++n,
    longTerm:  hasLongTerm ? ++n : null,
    shortLet:  hasShortLet ? ++n : null,
    expenses:  ++n,
    pl:        ++n,
    pettyCash: ++n,
    mgmtFee:   ++n,
    vendors:   hasVendors ? ++n : null,
    tax:       hasTax     ? ++n : null,
    alerts:    hasAlerts  ? ++n : null,
  };

  const totalRentExpected = data.rentCollection.reduce((s, t) => s + t.expectedRent + t.serviceCharge, 0);
  const totalRentReceived = data.rentCollection.reduce((s, t) => s + t.received, 0);
  const totalAlbaGross    = data.albaPerformance.reduce((s, u) => s + u.grossRevenue, 0);
  const totalAlbaNet      = data.albaPerformance.reduce((s, u) => s + u.netRevenue - u.fixedCosts - u.variableCosts, 0);
  const operatingExpenses = data.expenses.filter((e) => !e.isSunkCost);
  const sunkCosts         = data.expenses.filter((e) => e.isSunkCost);
  const totalOpex         = operatingExpenses.reduce((s, e) => s + e.amount, 0);
  const totalSunk         = sunkCosts.reduce((s, e) => s + e.amount, 0);
  const grossIncome       = data.kpis.grossIncome;
  const margin            = grossIncome > 0 ? ((data.kpis.netProfit / grossIncome) * 100).toFixed(1) : "0.0";

  const footerProps = { period: data.period, property: data.property, manager: data.managerName };

  return (
    <Document title={data.title} author="Property Manager">
      {/* ── COVER PAGE ─────────────────────────────────────── */}
      <Page size="A4" style={styles.coverPage}>
        <Text style={styles.coverSub}>PROPERTY MANAGEMENT REPORT</Text>
        <Text style={styles.coverTitle}>{data.property}</Text>
        <Text style={[styles.coverMeta, { marginTop: 8 }]}>Period: {data.period}</Text>
        <Text style={styles.coverMeta}>Owner: {data.ownerName}</Text>
        <Text style={styles.coverMeta}>Manager: {data.managerName}</Text>
        <Text style={styles.coverMeta}>Prepared: {data.generatedAt}</Text>
        <Text style={styles.confidential}>CONFIDENTIAL · FOR OWNER USE ONLY</Text>
      </Page>

      {/* ── MAIN REPORT ────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        {/* Section 1: Executive Summary */}
        <Text style={styles.sectionTitle}>
          <Text style={styles.sectionNumber}>{SEC.exec}. </Text>Executive Summary
        </Text>
        <View style={styles.kpiRow}>
          {[
            { label: "Gross Income",        value: fmt(data.kpis.grossIncome),      color: "#16A34A" },
            { label: "Agent Commissions",   value: fmt(data.kpis.agentCommissions), color: "#DC2626" },
            { label: "Total Expenses",      value: fmt(data.kpis.totalExpenses),    color: "#DC2626" },
            { label: "Net Profit to Owner", value: fmt(data.kpis.netProfit),        color: data.kpis.netProfit >= 0 ? "#16A34A" : "#DC2626" },
            { label: "Occupancy Rate",      value: `${data.kpis.occupancyRate}%`,   color: data.kpis.occupancyRate >= 80 ? "#16A34A" : "#D97706" },
          ].map((kpi) => (
            <View key={kpi.label} style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>{kpi.label}</Text>
              <Text style={[styles.kpiValue, { color: kpi.color }]}>{kpi.value}</Text>
            </View>
          ))}
        </View>

        {/* Section 2: Rent Collection (long-term only) */}
        {hasLongTerm && (
          <>
            <Text style={styles.sectionTitle}>
              <Text style={styles.sectionNumber}>{SEC.longTerm}. </Text>{data.longTermPropertyName} — Rent Collection
            </Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                {["Tenant", "Unit", "Type", "Expected", "Received", "Variance", "Status", "Lease End"].map((h, i) => (
                  <Text key={h} style={[styles.tableHeaderCell, { flex: i === 0 ? 3 : i <= 2 ? 1.2 : i === 7 ? 1.5 : 1.5 }]}>{h}</Text>
                ))}
              </View>
              {data.rentCollection.map((t, idx) => (
                <View key={t.unit} style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}>
                  <Text style={[styles.tableCell, { flex: 3 }]}>{t.tenantName}</Text>
                  <Text style={[styles.tableCell, { flex: 1.2 }]}>{t.unit}</Text>
                  <Text style={[styles.tableCell, { flex: 1.2 }]}>{UNIT_LABEL[t.type] ?? t.type}</Text>
                  <Text style={[styles.tableCellMono, { flex: 1.5, textAlign: "right" }]}>{fmt(t.expectedRent + t.serviceCharge)}</Text>
                  <Text style={[styles.tableCellMono, { flex: 1.5, textAlign: "right" }]}>{fmt(t.received)}</Text>
                  <Text style={[styles.tableCellMono, { flex: 1.5, textAlign: "right" }, t.variance < 0 ? styles.negative : t.variance > 0 ? styles.positive : {}]}>{fmt(t.variance)}</Text>
                  <Text style={[styles.tableCell, { flex: 1.5 }, t.variance < 0 ? styles.negative : styles.positive]}>{t.variance < 0 ? "OUTSTANDING" : t.status === "TBC" ? "TBC" : "PAID"}</Text>
                  <Text style={[styles.tableCell, { flex: 1.5 }, t.leaseEnd ? {} : styles.muted]}>{t.leaseEnd ?? "—"}</Text>
                </View>
              ))}
              <View style={styles.tableRowTotal}>
                <Text style={[styles.tableCell, styles.tableCellBold, { flex: 3 }]}>TOTAL</Text>
                <Text style={[styles.tableCell, { flex: 1.2 }]} />
                <Text style={[styles.tableCell, { flex: 1.2 }]} />
                <Text style={[styles.tableCellMono, styles.tableCellBold, { flex: 1.5, textAlign: "right" }]}>{fmt(totalRentExpected)}</Text>
                <Text style={[styles.tableCellMono, styles.tableCellBold, { flex: 1.5, textAlign: "right" }]}>{fmt(totalRentReceived)}</Text>
                <Text style={[styles.tableCellMono, styles.tableCellBold, { flex: 1.5, textAlign: "right" }, totalRentReceived - totalRentExpected < 0 ? styles.negative : styles.positive]}>{fmt(totalRentReceived - totalRentExpected)}</Text>
                <Text style={[styles.tableCell, { flex: 1.5 }]} />
                <Text style={[styles.tableCell, { flex: 1.5 }]} />
              </View>
            </View>
          </>
        )}

        <PageFooter {...footerProps} />
      </Page>

      <Page size="A4" style={styles.page}>
        {/* Section 3: Short-Let Performance (Airbnb only) */}
        {hasShortLet && (
          <>
            <Text style={styles.sectionTitle}>
              <Text style={styles.sectionNumber}>{SEC.shortLet}. </Text>{data.shortLetPropertyName} — Short-Let Performance
            </Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                {["Unit", "Type", "Gross Rev.", "Commissions", "Fixed Costs", "Variable", "Net Revenue", "Occupancy"].map((h, i) => (
                  <Text key={h} style={[styles.tableHeaderCell, { flex: i === 0 ? 1 : 1.5 }]}>{h}</Text>
                ))}
              </View>
              {data.albaPerformance.map((u, idx) => {
                const net = u.netRevenue - u.fixedCosts - u.variableCosts;
                const occ = u.daysInMonth > 0 ? Math.round((u.bookedNights / u.daysInMonth) * 100) : 0;
                return (
                  <View key={u.unitNumber} style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}>
                    <Text style={[styles.tableCell, { flex: 1 }]}>{u.unitNumber}</Text>
                    <Text style={[styles.tableCell, { flex: 1.5 }]}>{UNIT_LABEL[u.type] ?? u.type}</Text>
                    <Text style={[styles.tableCellMono, { flex: 1.5, textAlign: "right" }]}>{fmt(u.grossRevenue)}</Text>
                    <Text style={[styles.tableCellMono, styles.negative, { flex: 1.5, textAlign: "right" }]}>{fmt(u.commissions)}</Text>
                    <Text style={[styles.tableCellMono, styles.negative, { flex: 1.5, textAlign: "right" }]}>{fmt(u.fixedCosts)}</Text>
                    <Text style={[styles.tableCellMono, styles.negative, { flex: 1.5, textAlign: "right" }]}>{fmt(u.variableCosts)}</Text>
                    <Text style={[styles.tableCellMono, { flex: 1.5, textAlign: "right" }, net >= 0 ? styles.positive : styles.negative]}>{fmt(net)}</Text>
                    <Text style={[styles.tableCell, { flex: 1.5 }]}>{u.bookedNights > 0 ? `${u.bookedNights}n / ${occ}%` : "Vacant"}</Text>
                  </View>
                );
              })}
              <View style={styles.tableRowTotal}>
                <Text style={[styles.tableCell, styles.tableCellBold, { flex: 1 }]}>TOTAL</Text>
                <Text style={[styles.tableCell, { flex: 1.5 }]} />
                <Text style={[styles.tableCellMono, styles.tableCellBold, { flex: 1.5, textAlign: "right" }]}>{fmt(totalAlbaGross)}</Text>
                <Text style={[styles.tableCell, { flex: 1.5 }]} />
                <Text style={[styles.tableCell, { flex: 1.5 }]} />
                <Text style={[styles.tableCell, { flex: 1.5 }]} />
                <Text style={[styles.tableCellMono, styles.tableCellBold, { flex: 1.5, textAlign: "right" }, totalAlbaNet >= 0 ? styles.positive : styles.negative]}>{fmt(totalAlbaNet)}</Text>
                <Text style={[styles.tableCell, { flex: 1.5 }]} />
              </View>
            </View>
          </>
        )}

        {/* Section: Expense Breakdown */}
        <Text style={styles.sectionTitle}>
          <Text style={styles.sectionNumber}>{SEC.expenses}. </Text>Expense Breakdown
        </Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            {["Category", "Amount", "% of Gross Income"].map((h, i) => (
              <Text key={h} style={[styles.tableHeaderCell, { flex: i === 0 ? 3 : 2 }]}>{h}</Text>
            ))}
          </View>
          {operatingExpenses.map((e, idx) => (
            <View key={idx} style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}>
              <Text style={[styles.tableCell, { flex: 3 }]}>{e.category.replace(/_/g, " ")}</Text>
              <Text style={[styles.tableCellMono, { flex: 2, textAlign: "right" }]}>{fmt(e.amount)}</Text>
              <Text style={[styles.tableCellMono, styles.muted, { flex: 2, textAlign: "right" }]}>{grossIncome > 0 ? ((e.amount / grossIncome) * 100).toFixed(1) + "%" : "—"}</Text>
            </View>
          ))}
          <View style={styles.tableRowTotal}>
            <Text style={[styles.tableCell, styles.tableCellBold, { flex: 3 }]}>TOTAL OPERATING EXPENSES</Text>
            <Text style={[styles.tableCellMono, styles.tableCellBold, { flex: 2, textAlign: "right" }]}>{fmt(totalOpex)}</Text>
            <Text style={[styles.tableCellMono, styles.tableCellBold, { flex: 2, textAlign: "right" }]}>{grossIncome > 0 ? ((totalOpex / grossIncome) * 100).toFixed(1) + "%" : "—"}</Text>
          </View>
        </View>

        {sunkCosts.length > 0 && (
          <>
            <Text style={[styles.tableCell, styles.muted, { marginBottom: 4, marginTop: 8, fontFamily: "Helvetica-Oblique" }]}>
              Capital / Sunk Costs — excluded from monthly P&L
            </Text>
            {sunkCosts.map((e, idx) => (
              <View key={idx} style={styles.tableRow}>
                <Text style={[styles.tableCell, styles.muted, { flex: 3 }]}>{e.category.replace(/_/g, " ")}</Text>
                <Text style={[styles.tableCellMono, styles.muted, { flex: 2, textAlign: "right" }]}>{fmt(e.amount)}</Text>
                <Text style={[styles.tableCell, { flex: 2 }]}>excl.</Text>
              </View>
            ))}
            <View style={[styles.plRow, { backgroundColor: "#FEF2F2" }]}>
              <Text style={[styles.plLabel, styles.muted]}>Total capital items (not deducted)</Text>
              <Text style={[styles.plValue, styles.muted]}>{fmt(totalSunk)}</Text>
            </View>
          </>
        )}

        <PageFooter {...footerProps} />
      </Page>

      <Page size="A4" style={styles.page}>
        {/* Section: P&L */}
        <Text style={styles.sectionTitle}>
          <Text style={styles.sectionNumber}>{SEC.pl}. </Text>Profit & Loss Summary
        </Text>
        <View>
          {[
            { label: "Gross Income",                        value: grossIncome,                                        bold: false, indent: 0 },
            { label: "Less: Agent Commissions",             value: -data.kpis.agentCommissions,                        bold: false, indent: 1 },
            { label: "Net Income (after commissions)",      value: grossIncome - data.kpis.agentCommissions,           bold: true,  indent: 0 },
            { label: "Less: Operating Expenses",            value: -totalOpex,                                         bold: false, indent: 1 },
          ].map((row, i) => (
            <View key={i} style={styles.plRow}>
              <Text style={[styles.plLabel, row.bold ? styles.tableCellBold : {}, { paddingLeft: row.indent * 12 }]}>{row.label}</Text>
              <Text style={[styles.plValue, row.value < 0 ? styles.negative : {}, row.bold ? styles.tableCellBold : {}]}>{fmt(row.value)}</Text>
            </View>
          ))}
          <View style={styles.plRowTotal}>
            <Text style={styles.plLabelTotal}>Net Profit to Owner</Text>
            <View>
              <Text style={styles.plValueTotal}>{fmt(data.kpis.netProfit)}</Text>
              <Text style={[styles.footerText, { color: "#C9A84C", textAlign: "right" }]}>Margin: {margin}%</Text>
            </View>
          </View>
        </View>

        {/* Section: Petty Cash */}
        <Text style={styles.sectionTitle}>
          <Text style={styles.sectionNumber}>{SEC.pettyCash}. </Text>Petty Cash Reconciliation
        </Text>
        <View>
          {[
            { label: "Petty cash received", value: data.pettyCash.totalIn },
            { label: "Cash spent",          value: -data.pettyCash.totalOut },
          ].map((row, i) => (
            <View key={i} style={styles.plRow}>
              <Text style={styles.plLabel}>{row.label}</Text>
              <Text style={[styles.plValue, row.value < 0 ? styles.negative : styles.positive]}>{fmt(row.value)}</Text>
            </View>
          ))}
          <View style={[styles.plRowTotal, { backgroundColor: data.pettyCash.balance >= 0 ? "#1A1A2E" : "#7F1D1D" }]}>
            <Text style={styles.plLabelTotal}>{data.pettyCash.balance >= 0 ? "Petty Cash Surplus" : "Petty Cash DEFICIT"}</Text>
            <Text style={[styles.plValueTotal, data.pettyCash.balance < 0 ? { color: "#FCA5A5" } : {}]}>{fmt(data.pettyCash.balance)}</Text>
          </View>
        </View>

        {/* Section: Management Fee */}
        <Text style={styles.sectionTitle}>
          <Text style={styles.sectionNumber}>{SEC.mgmtFee}. </Text>Management Fee Reconciliation
        </Text>
        <View>
          {[
            { label: "Fees owing this month", value: -data.mgmtFee.owing },
            { label: "Fees paid",             value: data.mgmtFee.paid },
          ].map((row, i) => (
            <View key={i} style={styles.plRow}>
              <Text style={styles.plLabel}>{row.label}</Text>
              <Text style={[styles.plValue, row.value < 0 ? styles.negative : styles.positive]}>{fmt(Math.abs(row.value))}</Text>
            </View>
          ))}
          <View style={[styles.plRowTotal, { backgroundColor: data.mgmtFee.balance >= 0 ? "#1A1A2E" : "#7F1D1D" }]}>
            <Text style={styles.plLabelTotal}>{data.mgmtFee.balance >= 0 ? "Surplus / Overpaid" : "Outstanding Balance"}</Text>
            <Text style={[styles.plValueTotal, data.mgmtFee.balance < 0 ? { color: "#FCA5A5" } : {}]}>{fmt(data.mgmtFee.balance)}</Text>
          </View>
        </View>

        {/* Section: Vendor Spend */}
        {hasVendors && (
          <>
            <Text style={styles.sectionTitle}>
              <Text style={styles.sectionNumber}>{SEC.vendors}. </Text>Vendor Spend
            </Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                {["Vendor", "Category", "Invoices", "Total Spend"].map((h, i) => (
                  <Text key={h} style={[styles.tableHeaderCell, { flex: i === 0 ? 3 : i === 3 ? 2 : 1.5 }]}>{h}</Text>
                ))}
              </View>
              {(data.vendorSpend ?? []).map((v, idx) => (
                <View key={v.vendorId} style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}>
                  <Text style={[styles.tableCell, { flex: 3 }]}>{v.name}</Text>
                  <Text style={[styles.tableCell, { flex: 1.5 }]}>{VENDOR_CATEGORY_LABEL[v.category] ?? v.category}</Text>
                  <Text style={[styles.tableCellMono, { flex: 1.5, textAlign: "right" }]}>{v.expenseCount}</Text>
                  <Text style={[styles.tableCellMono, { flex: 2, textAlign: "right" }]}>{fmt(v.totalSpend)}</Text>
                </View>
              ))}
              <View style={styles.tableRowTotal}>
                <Text style={[styles.tableCell, styles.tableCellBold, { flex: 3 }]}>TOTAL</Text>
                <Text style={[styles.tableCell, { flex: 1.5 }]} />
                <Text style={[styles.tableCellMono, styles.tableCellBold, { flex: 1.5, textAlign: "right" }]}>{(data.vendorSpend ?? []).reduce((s, v) => s + v.expenseCount, 0)}</Text>
                <Text style={[styles.tableCellMono, styles.tableCellBold, { flex: 2, textAlign: "right" }]}>{fmt((data.vendorSpend ?? []).reduce((s, v) => s + v.totalSpend, 0))}</Text>
              </View>
            </View>
          </>
        )}

        {/* Section: Tax Summary */}
        {hasTax && (
          <>
            <Text style={styles.sectionTitle}>
              <Text style={styles.sectionNumber}>{SEC.tax}. </Text>Tax Summary
            </Text>
            <View style={{ marginBottom: 4 }}>
              {data.taxSummary!.outputTaxAdditive > 0 && (
                <View style={styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 3 }]}>Output VAT / GST collected on income</Text>
                  <Text style={[styles.tableCell, styles.tableCellRight]}>{fmt(data.taxSummary!.outputTaxAdditive)}</Text>
                </View>
              )}
              {data.taxSummary!.outputTaxWithheld > 0 && (
                <View style={styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 3 }]}>WHT deducted from owner remittances</Text>
                  <Text style={[styles.tableCell, styles.tableCellRight]}>{fmt(data.taxSummary!.outputTaxWithheld)}</Text>
                </View>
              )}
              {data.taxSummary!.inputTaxAdditive > 0 && (
                <View style={styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 3, color: "#6b7280" }]}>Input VAT / GST paid on expenses</Text>
                  <Text style={[styles.tableCell, styles.tableCellRight, { color: "#6b7280" }]}>({fmt(data.taxSummary!.inputTaxAdditive)})</Text>
                </View>
              )}
              {data.taxSummary!.inputTaxWithheld > 0 && (
                <View style={styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 3, color: "#6b7280" }]}>WHT withheld from contractor payments</Text>
                  <Text style={[styles.tableCell, styles.tableCellRight, { color: "#6b7280" }]}>({fmt(data.taxSummary!.inputTaxWithheld)})</Text>
                </View>
              )}
              {(data.taxSummary!.outputTaxAdditive > 0 || data.taxSummary!.inputTaxAdditive > 0) && (
                <View style={[styles.tableRow, { borderTopWidth: 1, borderTopColor: "#e5e7eb", marginTop: 2 }]}>
                  <Text style={[styles.tableCell, styles.tableCellBold, { flex: 3 }]}>Net VAT Liability (output − input)</Text>
                  <Text style={[styles.tableCell, styles.tableCellBold, styles.tableCellRight]}>{fmt(data.taxSummary!.netVatLiability)}</Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: 7, color: "#9ca3af", marginBottom: 12, fontStyle: "italic" }}>
              All figures are informational only. Consult your tax adviser for filing obligations.
            </Text>
          </>
        )}

        {/* Section: Notes & Flags */}
        {hasAlerts && (
          <>
            <Text style={styles.sectionTitle}>
              <Text style={styles.sectionNumber}>{SEC.alerts}. </Text>Notes & Flags
            </Text>
            {data.alerts.map((alert, i) => (
              <View key={i} style={styles.alertBox}>
                <Text style={styles.alertText}>⚠ {alert}</Text>
              </View>
            ))}
          </>
        )}

        <PageFooter {...footerProps} />
      </Page>
    </Document>
  );
}
