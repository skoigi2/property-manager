import { Document, Page, View, Text } from "@react-pdf/renderer";
import { styles } from "./PdfStyles";
import type { ReportData } from "@/types/report";

function formatKSh(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}KSh ${Math.abs(n).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}

function PageFooter({ period, manager, pageNum: _pageNum }: { period: string; manager: string; pageNum: number }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>Property Manager · {period}</Text>
      <Text style={styles.footerText}>{manager}</Text>
      <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

export function ReportDocument({ data }: { data: ReportData }) {
  const totalRentExpected = data.rentCollection.reduce((s, t) => s + t.expectedRent + t.serviceCharge, 0);
  const totalRentReceived = data.rentCollection.reduce((s, t) => s + t.received, 0);
  const totalAlbaGross = data.albaPerformance.reduce((s, u) => s + u.grossRevenue, 0);
  const totalAlbaNet = data.albaPerformance.reduce((s, u) => s + u.netRevenue - u.fixedCosts - u.variableCosts, 0);
  const operatingExpenses = data.expenses.filter((e) => !e.isSunkCost);
  const sunkCosts = data.expenses.filter((e) => e.isSunkCost);
  const totalOpex = operatingExpenses.reduce((s, e) => s + e.amount, 0);
  const totalSunk = sunkCosts.reduce((s, e) => s + e.amount, 0);
  const grossIncome = data.kpis.grossIncome;
  const margin = grossIncome > 0 ? ((data.kpis.netProfit / grossIncome) * 100).toFixed(1) : "0.0";

  return (
    <Document title={data.title} author="Property Manager">
      {/* ── COVER PAGE ─────────────────────────────────────── */}
      <Page size="A4" style={styles.coverPage}>
        <Text style={styles.coverSub}>PROPERTY MANAGEMENT REPORT</Text>
        <Text style={styles.coverTitle}>{data.property}</Text>
        <Text style={[styles.coverMeta, { marginTop: 8 }]}>Period: {data.period}</Text>
        <Text style={styles.coverMeta}>Prepared: {data.generatedAt}</Text>
        <Text style={styles.coverMeta}>Manager: {data.generatedBy}</Text>
        <Text style={styles.confidential}>CONFIDENTIAL · FOR OWNER USE ONLY</Text>
      </Page>

      {/* ── MAIN REPORT ────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        {/* Section 1: KPIs */}
        <Text style={styles.sectionTitle}>
          <Text style={styles.sectionNumber}>1. </Text>Executive Summary
        </Text>
        <View style={styles.kpiRow}>
          {[
            { label: "Gross Income", value: data.kpis.grossIncome, color: "#16A34A" },
            { label: "Agent Commissions", value: data.kpis.agentCommissions, color: "#DC2626" },
            { label: "Total Expenses", value: data.kpis.totalExpenses, color: "#DC2626" },
            { label: "Net Profit to Owner", value: data.kpis.netProfit, color: data.kpis.netProfit >= 0 ? "#16A34A" : "#DC2626" },
          ].map((kpi) => (
            <View key={kpi.label} style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>{kpi.label}</Text>
              <Text style={[styles.kpiValue, { color: kpi.color }]}>{formatKSh(kpi.value)}</Text>
            </View>
          ))}
        </View>

        {/* Section 2: Riara One Rent Collection */}
        <Text style={styles.sectionTitle}>
          <Text style={styles.sectionNumber}>2. </Text>Riara One — Rent Collection
        </Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            {["Tenant", "Unit", "Type", "Expected", "Received", "Variance", "Status"].map((h, i) => (
              <Text key={h} style={[styles.tableHeaderCell, { flex: i === 0 ? 3 : i <= 2 ? 1.2 : 1.5 }]}>{h}</Text>
            ))}
          </View>
          {data.rentCollection.map((t, idx) => (
            <View key={t.unit} style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}>
              <Text style={[styles.tableCell, { flex: 3 }]}>{t.tenantName}</Text>
              <Text style={[styles.tableCell, { flex: 1.2 }]}>{t.unit}</Text>
              <Text style={[styles.tableCell, { flex: 1.2 }]}>{t.type === "ONE_BED" ? "1 Bed" : "2 Bed"}</Text>
              <Text style={[styles.tableCellMono, { flex: 1.5, textAlign: "right" }]}>{formatKSh(t.expectedRent + t.serviceCharge)}</Text>
              <Text style={[styles.tableCellMono, { flex: 1.5, textAlign: "right" }]}>{formatKSh(t.received)}</Text>
              <Text style={[styles.tableCellMono, { flex: 1.5, textAlign: "right" }, t.variance < 0 ? styles.negative : t.variance > 0 ? styles.positive : {}]}>{formatKSh(t.variance)}</Text>
              <Text style={[styles.tableCell, { flex: 1.5 }, t.status === "CRITICAL" || t.variance < 0 ? styles.negative : styles.positive]}>{t.variance < 0 ? "OUTSTANDING" : t.status === "TBC" ? "TBC" : "PAID"}</Text>
            </View>
          ))}
          <View style={styles.tableRowTotal}>
            <Text style={[styles.tableCell, styles.tableCellBold, { flex: 3 }]}>TOTAL</Text>
            <Text style={[styles.tableCell, { flex: 1.2 }]} />
            <Text style={[styles.tableCell, { flex: 1.2 }]} />
            <Text style={[styles.tableCellMono, styles.tableCellBold, { flex: 1.5, textAlign: "right" }]}>{formatKSh(totalRentExpected)}</Text>
            <Text style={[styles.tableCellMono, styles.tableCellBold, { flex: 1.5, textAlign: "right" }]}>{formatKSh(totalRentReceived)}</Text>
            <Text style={[styles.tableCellMono, styles.tableCellBold, { flex: 1.5, textAlign: "right" }, totalRentReceived - totalRentExpected < 0 ? styles.negative : styles.positive]}>{formatKSh(totalRentReceived - totalRentExpected)}</Text>
            <Text style={[styles.tableCell, { flex: 1.5 }]} />
          </View>
        </View>

        <PageFooter period={data.period} manager={data.generatedBy} pageNum={1} />
      </Page>

      <Page size="A4" style={styles.page}>
        {/* Section 3: Alba Gardens */}
        <Text style={styles.sectionTitle}>
          <Text style={styles.sectionNumber}>3. </Text>Alba Gardens — Short-Let Performance
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
                <Text style={[styles.tableCell, { flex: 1.5 }]}>{u.type === "ONE_BED" ? "1 Bed" : "2 Bed"}</Text>
                <Text style={[styles.tableCellMono, { flex: 1.5, textAlign: "right" }]}>{formatKSh(u.grossRevenue)}</Text>
                <Text style={[styles.tableCellMono, styles.negative, { flex: 1.5, textAlign: "right" }]}>{formatKSh(u.commissions)}</Text>
                <Text style={[styles.tableCellMono, styles.negative, { flex: 1.5, textAlign: "right" }]}>{formatKSh(u.fixedCosts)}</Text>
                <Text style={[styles.tableCellMono, styles.negative, { flex: 1.5, textAlign: "right" }]}>{formatKSh(u.variableCosts)}</Text>
                <Text style={[styles.tableCellMono, { flex: 1.5, textAlign: "right" }, net >= 0 ? styles.positive : styles.negative]}>{formatKSh(net)}</Text>
                <Text style={[styles.tableCell, { flex: 1.5 }]}>{u.bookedNights > 0 ? `${u.bookedNights}n / ${occ}%` : "Vacant"}</Text>
              </View>
            );
          })}
          <View style={styles.tableRowTotal}>
            <Text style={[styles.tableCell, styles.tableCellBold, { flex: 1 }]}>TOTAL</Text>
            <Text style={[styles.tableCell, { flex: 1.5 }]} />
            <Text style={[styles.tableCellMono, styles.tableCellBold, { flex: 1.5, textAlign: "right" }]}>{formatKSh(totalAlbaGross)}</Text>
            <Text style={[styles.tableCell, { flex: 1.5 }]} />
            <Text style={[styles.tableCell, { flex: 1.5 }]} />
            <Text style={[styles.tableCell, { flex: 1.5 }]} />
            <Text style={[styles.tableCellMono, styles.tableCellBold, { flex: 1.5, textAlign: "right" }, totalAlbaNet >= 0 ? styles.positive : styles.negative]}>{formatKSh(totalAlbaNet)}</Text>
            <Text style={[styles.tableCell, { flex: 1.5 }]} />
          </View>
        </View>

        {/* Section 4: Expense Breakdown */}
        <Text style={styles.sectionTitle}>
          <Text style={styles.sectionNumber}>4. </Text>Expense Breakdown
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
              <Text style={[styles.tableCellMono, { flex: 2, textAlign: "right" }]}>{formatKSh(e.amount)}</Text>
              <Text style={[styles.tableCellMono, styles.muted, { flex: 2, textAlign: "right" }]}>{grossIncome > 0 ? ((e.amount / grossIncome) * 100).toFixed(1) + "%" : "—"}</Text>
            </View>
          ))}
          <View style={styles.tableRowTotal}>
            <Text style={[styles.tableCell, styles.tableCellBold, { flex: 3 }]}>TOTAL OPERATING EXPENSES</Text>
            <Text style={[styles.tableCellMono, styles.tableCellBold, { flex: 2, textAlign: "right" }]}>{formatKSh(totalOpex)}</Text>
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
                <Text style={[styles.tableCellMono, styles.muted, { flex: 2, textAlign: "right" }]}>{formatKSh(e.amount)}</Text>
                <Text style={[styles.tableCell, { flex: 2 }]}>excl.</Text>
              </View>
            ))}
            <View style={[styles.plRow, { backgroundColor: "#FEF2F2" }]}>
              <Text style={[styles.plLabel, styles.muted]}>Total capital items (not deducted)</Text>
              <Text style={[styles.plValue, styles.muted]}>{formatKSh(totalSunk)}</Text>
            </View>
          </>
        )}

        <PageFooter period={data.period} manager={data.generatedBy} pageNum={2} />
      </Page>

      <Page size="A4" style={styles.page}>
        {/* Section 5: P&L */}
        <Text style={styles.sectionTitle}>
          <Text style={styles.sectionNumber}>5. </Text>Profit & Loss Summary
        </Text>
        <View>
          {[
            { label: "Gross Income", value: grossIncome, bold: false, indent: 0 },
            { label: "Less: Agent Commissions", value: -data.kpis.agentCommissions, bold: false, indent: 1 },
            { label: "Net Income (after commissions)", value: grossIncome - data.kpis.agentCommissions, bold: true, indent: 0 },
            { label: "Less: Operating Expenses", value: -totalOpex, bold: false, indent: 1 },
          ].map((row, i) => (
            <View key={i} style={styles.plRow}>
              <Text style={[styles.plLabel, row.bold ? styles.tableCellBold : {}, { paddingLeft: row.indent * 12 }]}>{row.label}</Text>
              <Text style={[styles.plValue, row.value < 0 ? styles.negative : {}, row.bold ? styles.tableCellBold : {}]}>{formatKSh(row.value)}</Text>
            </View>
          ))}
          <View style={styles.plRowTotal}>
            <Text style={styles.plLabelTotal}>Net Profit to Owner</Text>
            <View>
              <Text style={styles.plValueTotal}>{formatKSh(data.kpis.netProfit)}</Text>
              <Text style={[styles.footerText, { color: "#C9A84C", textAlign: "right" }]}>Margin: {margin}%</Text>
            </View>
          </View>
        </View>

        {/* Section 6: Petty Cash */}
        <Text style={styles.sectionTitle}>
          <Text style={styles.sectionNumber}>6. </Text>Petty Cash Reconciliation
        </Text>
        <View>
          {[
            { label: "Cash received (from Pauline)", value: data.pettyCash.totalIn },
            { label: "Cash spent", value: -data.pettyCash.totalOut },
          ].map((row, i) => (
            <View key={i} style={styles.plRow}>
              <Text style={styles.plLabel}>{row.label}</Text>
              <Text style={[styles.plValue, row.value < 0 ? styles.negative : styles.positive]}>{formatKSh(row.value)}</Text>
            </View>
          ))}
          <View style={[styles.plRowTotal, { backgroundColor: data.pettyCash.balance >= 0 ? "#1A1A2E" : "#7F1D1D" }]}>
            <Text style={styles.plLabelTotal}>{data.pettyCash.balance >= 0 ? "Petty Cash Surplus" : "Petty Cash DEFICIT"}</Text>
            <Text style={[styles.plValueTotal, data.pettyCash.balance < 0 ? { color: "#FCA5A5" } : {}]}>{formatKSh(data.pettyCash.balance)}</Text>
          </View>
        </View>

        {/* Section 7: Management Fee Reconciliation */}
        <Text style={styles.sectionTitle}>
          <Text style={styles.sectionNumber}>7. </Text>Management Fee Reconciliation
        </Text>
        <View>
          {[
            { label: "Fees owing this month", value: -data.mgmtFee.owing },
            { label: "Fees paid", value: data.mgmtFee.paid },
          ].map((row, i) => (
            <View key={i} style={styles.plRow}>
              <Text style={styles.plLabel}>{row.label}</Text>
              <Text style={[styles.plValue, row.value < 0 ? styles.negative : styles.positive]}>{formatKSh(Math.abs(row.value))}</Text>
            </View>
          ))}
          <View style={[styles.plRowTotal, { backgroundColor: data.mgmtFee.balance >= 0 ? "#1A1A2E" : "#7F1D1D" }]}>
            <Text style={styles.plLabelTotal}>{data.mgmtFee.balance >= 0 ? "Surplus / Overpaid" : "Outstanding Balance"}</Text>
            <Text style={[styles.plValueTotal, data.mgmtFee.balance < 0 ? { color: "#FCA5A5" } : {}]}>{formatKSh(data.mgmtFee.balance)}</Text>
          </View>
        </View>

        {/* Section 8: Notes & Flags */}
        {data.alerts.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              <Text style={styles.sectionNumber}>8. </Text>Notes & Flags
            </Text>
            {data.alerts.map((alert, i) => (
              <View key={i} style={styles.alertBox}>
                <Text style={styles.alertText}>⚠ {alert}</Text>
              </View>
            ))}
          </>
        )}

        <PageFooter period={data.period} manager={data.generatedBy} pageNum={3} />
      </Page>
    </Document>
  );
}
