import { Document, Page, View, Text, type Styles } from "@react-pdf/renderer";
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

// ── Helper components ────────────────────────────────────────────────────────

function PageHeader({ period, property }: { period: string; property: string }) {
  return (
    <View style={styles.pageHeaderStrip} fixed>
      <Text style={styles.pageHeaderLeft}>Property Performance Report</Text>
      <Text style={styles.pageHeaderRight}>{period} · {property}</Text>
    </View>
  );
}

function PageFooter({ period, property }: { period: string; property: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>
        KOKA Advisory Group · {property} · Property Performance Report · {period}
      </Text>
      <Text
        style={styles.footerText}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages} · Confidential`}
      />
    </View>
  );
}

function SectionHeading({ num, title }: { num: number | null; title: string }) {
  return (
    <View style={styles.sectionHeadingRow}>
      <View style={styles.sectionAccentBar} />
      <Text style={styles.sectionTitle}>
        {num !== null && <Text style={styles.sectionNumber}>{num}.  </Text>}
        {title}
      </Text>
    </View>
  );
}

function StatusPill({
  variance,
  status,
  leaseEnd,
}: {
  variance: number;
  status: string;
  leaseEnd: string | null;
}) {
  const resolve = (): { label: string; bg: Styles[string]; text: Styles[string] } => {
    if (variance < 0) return { label: "OUTSTANDING", bg: styles.pillOutstanding, text: styles.pillTextOutstanding };
    if (status === "TBC") return { label: "TBC", bg: styles.pillTbc, text: styles.pillTextTbc };
    if (leaseEnd) {
      const daysLeft = Math.floor((new Date(leaseEnd).getTime() - Date.now()) / 86400000);
      if (daysLeft < 0)   return { label: "EXPIRED",       bg: styles.pillExpired,       text: styles.pillTextExpired };
      if (daysLeft <= 60) return { label: "EXPIRING SOON", bg: styles.pillExpiringSoon,  text: styles.pillTextExpiringSoon };
    }
    return { label: "PAID", bg: styles.pillPaid, text: styles.pillTextPaid };
  };

  const { label, bg, text } = resolve();
  return (
    <View style={[styles.pillBase, bg]}>
      <Text style={text}>{label}</Text>
    </View>
  );
}

function getAlertSeverity(alert: string): "CRITICAL" | "HIGH" | "MEDIUM" {
  const lower = alert.toLowerCase();
  if (lower.includes("expired") || lower.includes("deficit") || lower.includes("outstanding")) {
    return "CRITICAL";
  }
  if (lower.includes("expiring")) return "HIGH";
  return "MEDIUM";
}

function AlertCard({ alert }: { alert: string }) {
  const severity = getAlertSeverity(alert);
  const badgeStyle =
    severity === "CRITICAL"
      ? styles.alertBadgeCritical
      : severity === "HIGH"
      ? styles.alertBadgeHigh
      : styles.alertBadgeMedium;
  const textStyle =
    severity === "CRITICAL"
      ? styles.alertBadgeTextCritical
      : severity === "HIGH"
      ? styles.alertBadgeTextHigh
      : styles.alertBadgeTextMedium;

  return (
    <View style={styles.alertCard}>
      <View style={badgeStyle}>
        <Text style={textStyle}>{severity}</Text>
      </View>
      <Text style={styles.alertText}>{alert}</Text>
    </View>
  );
}

// ── Main document ────────────────────────────────────────────────────────────

export function ReportDocument({ data }: { data: ReportData }) {
  const fmt = (n: number) => formatCurrency(n, data.currency ?? "USD");

  /** Split "KSh 1,213,000" → { symbol: "KSh", amount: "1,213,000" } */
  const fmtParts = (n: number): { symbol: string; amount: string } => {
    const full = fmt(Math.abs(n));
    const idx = full.search(/[\d,\.]/);
    if (idx <= 0) return { symbol: "", amount: full };
    return { symbol: full.slice(0, idx).trim(), amount: full.slice(idx).trim() };
  };

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

  const footerProps = { period: data.period, property: data.property };

  return (
    <Document title={data.title} author="Property Manager">

      {/* ── COVER PAGE ─────────────────────────────────────── */}
      <Page size="A4" style={styles.coverPage}>
        {/* Gold top bar */}
        <View style={styles.coverTopBar}>
          <Text style={styles.coverTopBarLeft}>KOKA ADVISORY GROUP</Text>
          <Text style={styles.coverTopBarRight}>Property &amp; Asset Management</Text>
        </View>

        {/* Accent bar + title block */}
        <View style={styles.coverBody}>
          <View style={styles.coverAccentBar} />
          <View style={styles.coverTitleBlock}>
            <Text style={styles.coverTitleLine}>PROPERTY</Text>
            <Text style={styles.coverTitleLine}>PERFORMANCE</Text>
            <Text style={styles.coverTitleGold}>REPORT</Text>
          </View>
        </View>

        {/* Gold rule */}
        <View style={styles.coverRule} />

        {/* Property name + meta */}
        <Text style={styles.coverPropertyName}>{data.property}</Text>
        <Text style={styles.coverMeta}>Period: {data.period}</Text>
        <Text style={styles.coverMeta}>Owner: {data.ownerName}</Text>
        <Text style={styles.coverMeta}>Manager: {data.managerName}</Text>
        <Text style={styles.coverMeta}>Prepared: {data.generatedAt}</Text>

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Footer strip */}
        <View style={styles.coverFooterStrip}>
          <View style={styles.coverFooterCol}>
            <Text style={styles.coverFooterLabel}>Prepared For</Text>
            <Text style={styles.coverFooterValue}>{data.ownerName}</Text>
          </View>
          <View style={styles.coverFooterCol}>
            <Text style={styles.coverFooterLabel}>Managed By</Text>
            <Text style={styles.coverFooterValue}>{data.managerName}</Text>
          </View>
          <View style={styles.coverFooterCol}>
            <Text style={styles.coverFooterLabel}>Classification</Text>
            <Text style={styles.coverFooterValue}>Confidential</Text>
          </View>
        </View>
      </Page>

      {/* ── PAGE 1: Executive Summary + Rent Collection ────── */}
      <Page size="A4" style={styles.page}>
        <PageHeader {...footerProps} />
        <View style={styles.pageContent}>

          {/* Section 1: Executive Summary */}
          <SectionHeading num={SEC.exec} title="Executive Summary" />
          <View style={styles.kpiRow}>
            {/* Gross Income */}
            {(() => { const { symbol, amount } = fmtParts(data.kpis.grossIncome); return (
              <View style={styles.kpiBoxIncome}>
                <Text style={styles.kpiLabel}>Gross Income</Text>
                <Text style={styles.kpiCurrency}>{symbol}</Text>
                <Text style={styles.kpiValue}>{amount}</Text>
              </View>
            ); })()}

            {/* Agent Commissions */}
            {(() => { const { symbol, amount } = fmtParts(data.kpis.agentCommissions); return (
              <View style={styles.kpiBoxCost}>
                <Text style={styles.kpiLabel}>Agent Commissions</Text>
                <Text style={styles.kpiCurrencyCost}>{symbol}</Text>
                <Text style={styles.kpiValueCost}>{amount}</Text>
              </View>
            ); })()}

            {/* Total Expenses */}
            {(() => { const { symbol, amount } = fmtParts(data.kpis.totalExpenses); return (
              <View style={styles.kpiBoxCost}>
                <Text style={styles.kpiLabel}>Total Expenses</Text>
                <Text style={styles.kpiCurrencyCost}>{symbol}</Text>
                <Text style={styles.kpiValueCost}>{amount}</Text>
              </View>
            ); })()}

            {/* Net Profit */}
            {(() => {
              const isPos = data.kpis.netProfit >= 0;
              const { symbol, amount } = fmtParts(data.kpis.netProfit);
              return (
                <View style={isPos ? styles.kpiBoxProfit : styles.kpiBoxProfitNeg}>
                  <Text style={styles.kpiLabel}>Net Profit to Owner</Text>
                  <Text style={isPos ? styles.kpiCurrencyProfit : styles.kpiCurrencyProfitNeg}>{symbol}</Text>
                  <Text style={isPos ? styles.kpiValueProfit : styles.kpiValueProfitNeg}>{amount}</Text>
                </View>
              );
            })()}

            {/* Occupancy Rate — centred */}
            <View style={styles.kpiBoxOccupancy}>
              <Text style={styles.kpiOccupancyLabel}>Occupancy Rate</Text>
              <Text style={styles.kpiOccupancyPct}>{data.kpis.occupancyRate}%</Text>
            </View>
          </View>

          {/* Section 2: Rent Collection (long-term only) */}
          {hasLongTerm && (
            <>
              <SectionHeading num={SEC.longTerm} title={`${data.longTermPropertyName} — Rent Collection`} />
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  {[
                    { h: "Tenant",    f: 2.5 },
                    { h: "Unit",      f: 0.8 },
                    { h: "Type",      f: 1.2 },
                    { h: "Expected",  f: 2 },
                    { h: "Received",  f: 2 },
                    { h: "Variance",  f: 2 },
                    { h: "Status",    f: 1.8 },
                    { h: "Lease End", f: 1.8 },
                  ].map(({ h, f }) => (
                    <Text key={h} style={[styles.tableHeaderCell, { flex: f }]}>{h}</Text>
                  ))}
                </View>
                {data.rentCollection.map((t, idx) => (
                  <View key={t.unit} style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}>
                    <Text style={[styles.tableCell, { flex: 2.5 }]}>{t.tenantName}</Text>
                    <Text style={[styles.tableCell, { flex: 0.8 }]}>{t.unit}</Text>
                    <Text style={[styles.tableCell, { flex: 1.2 }]}>{UNIT_LABEL[t.type] ?? t.type}</Text>
                    <Text style={[styles.tableCellMono, { flex: 2, textAlign: "right" }]}>{fmt(t.expectedRent + t.serviceCharge)}</Text>
                    <Text style={[styles.tableCellMono, { flex: 2, textAlign: "right" }]}>{fmt(t.received)}</Text>
                    <Text style={[styles.tableCellMono, { flex: 2, textAlign: "right" }, t.variance < 0 ? styles.negative : t.variance > 0 ? styles.positive : {}]}>{fmt(t.variance)}</Text>
                    <View style={{ flex: 1.8, alignItems: "center" }}>
                      <StatusPill variance={t.variance} status={t.status} leaseEnd={t.leaseEnd} />
                    </View>
                    <Text style={[styles.tableCell, { flex: 1.8 }, t.leaseEnd ? {} : styles.muted]}>{t.leaseEnd ?? "—"}</Text>
                  </View>
                ))}
                <View style={styles.tableRowTotal}>
                  <Text style={[styles.tableCell, styles.tableCellBold, { flex: 2.5 }]}>TOTAL</Text>
                  <Text style={[styles.tableCell, { flex: 0.8 }]} />
                  <Text style={[styles.tableCell, { flex: 1.2 }]} />
                  <Text style={[styles.tableCellMono, styles.tableCellBold, { flex: 2, textAlign: "right" }]}>{fmt(totalRentExpected)}</Text>
                  <Text style={[styles.tableCellMono, styles.tableCellBold, { flex: 2, textAlign: "right" }]}>{fmt(totalRentReceived)}</Text>
                  <Text style={[styles.tableCellMono, styles.tableCellBold, { flex: 2, textAlign: "right" }, totalRentReceived - totalRentExpected < 0 ? styles.negative : styles.positive]}>{fmt(totalRentReceived - totalRentExpected)}</Text>
                  <Text style={[styles.tableCell, { flex: 1.8 }]} />
                  <Text style={[styles.tableCell, { flex: 1.8 }]} />
                </View>
              </View>
            </>
          )}

        </View>
        <PageFooter {...footerProps} />
      </Page>

      {/* ── PAGE 2: Short-Let + Expenses ───────────────────── */}
      <Page size="A4" style={styles.page}>
        <PageHeader {...footerProps} />
        <View style={styles.pageContent}>

          {/* Section: Short-Let Performance (Airbnb only) */}
          {hasShortLet && (
            <>
              <SectionHeading num={SEC.shortLet} title={`${data.shortLetPropertyName} — Short-Let Performance`} />
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
          <SectionHeading num={SEC.expenses} title="Expense Breakdown" />
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
                Capital / Sunk Costs — excluded from monthly P&amp;L
              </Text>
              {sunkCosts.map((e, idx) => (
                <View key={idx} style={styles.tableRow}>
                  <Text style={[styles.tableCell, styles.muted, { flex: 3 }]}>{e.category.replace(/_/g, " ")}</Text>
                  <Text style={[styles.tableCellMono, styles.muted, { flex: 2, textAlign: "right" }]}>{fmt(e.amount)}</Text>
                  <Text style={[styles.tableCell, { flex: 2 }]}>excl.</Text>
                </View>
              ))}
              <View style={[styles.plRow, { backgroundColor: "#FEF3C7" }]}>
                <Text style={[styles.plLabel, styles.muted]}>Total capital items (not deducted)</Text>
                <Text style={[styles.plValue, styles.muted]}>{fmt(totalSunk)}</Text>
              </View>
            </>
          )}

        </View>
        <PageFooter {...footerProps} />
      </Page>

      {/* ── PAGE 3: P&L + Reconciliations + Vendors + Tax + Alerts ── */}
      <Page size="A4" style={styles.page}>
        <PageHeader {...footerProps} />
        <View style={styles.pageContent}>

          {/* Section: P&L */}
          <SectionHeading num={SEC.pl} title="Profit & Loss Summary" />
          <View style={styles.plPanel}>
            {[
              { label: "Gross Income",                   value: grossIncome,                              bold: false, indent: 0 },
              { label: "Less: Agent Commissions",        value: -data.kpis.agentCommissions,              bold: false, indent: 1 },
              { label: "Net Income (after commissions)", value: grossIncome - data.kpis.agentCommissions, bold: true,  indent: 0 },
              { label: "Less: Operating Expenses",       value: -totalOpex,                               bold: false, indent: 1 },
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
                <Text style={[styles.footerText, { color: "#B8902A", textAlign: "right" }]}>Margin: {margin}%</Text>
              </View>
            </View>
          </View>

          {/* Section: Petty Cash */}
          <SectionHeading num={SEC.pettyCash} title="Petty Cash Reconciliation" />
          <View style={styles.pettyCashPanel}>
            {[
              { label: "Petty cash received", value: data.pettyCash.totalIn },
              { label: "Cash spent",          value: -data.pettyCash.totalOut },
            ].map((row, i) => (
              <View key={i} style={styles.plRow}>
                <Text style={styles.plLabel}>{row.label}</Text>
                <Text style={[styles.plValue, row.value < 0 ? styles.negative : styles.positive]}>{fmt(row.value)}</Text>
              </View>
            ))}
            <View style={data.pettyCash.balance >= 0 ? styles.plRowTotalGreen : styles.plRowTotalAmber}>
              <Text style={styles.plLabelTotalDark}>
                {data.pettyCash.balance >= 0 ? "Petty Cash Surplus" : "Petty Cash DEFICIT"}
              </Text>
              <Text style={data.pettyCash.balance >= 0 ? styles.plValueTotalGreen : styles.plValueTotalRed}>
                {fmt(data.pettyCash.balance)}
              </Text>
            </View>
          </View>

          {/* Section: Management Fee */}
          <SectionHeading num={SEC.mgmtFee} title="Management Fee Reconciliation" />
          <View style={styles.mgmtFeePanel}>
            {[
              { label: "Fees owing this month", value: -data.mgmtFee.owing },
              { label: "Fees paid",             value: data.mgmtFee.paid },
            ].map((row, i) => (
              <View key={i} style={styles.plRow}>
                <Text style={styles.plLabel}>{row.label}</Text>
                <Text style={[styles.plValue, row.value < 0 ? styles.negative : styles.positive]}>{fmt(Math.abs(row.value))}</Text>
              </View>
            ))}
            <View style={data.mgmtFee.balance >= 0 ? styles.plRowTotalGreen : styles.plRowTotalAmber}>
              <Text style={styles.plLabelTotalDark}>
                {data.mgmtFee.balance >= 0 ? "Surplus / Overpaid" : "Outstanding Balance"}
              </Text>
              <Text style={data.mgmtFee.balance >= 0 ? styles.plValueTotalGreen : styles.plValueTotalRed}>
                {fmt(data.mgmtFee.balance)}
              </Text>
            </View>
          </View>

          {/* Section: Vendor Spend */}
          {hasVendors && (
            <>
              <SectionHeading num={SEC.vendors} title="Vendor Spend" />
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
              <SectionHeading num={SEC.tax} title="Tax Summary" />
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
                    <Text style={[styles.tableCell, { flex: 3, color: "#4A5568" }]}>Input VAT / GST paid on expenses</Text>
                    <Text style={[styles.tableCell, styles.tableCellRight, { color: "#4A5568" }]}>({fmt(data.taxSummary!.inputTaxAdditive)})</Text>
                  </View>
                )}
                {data.taxSummary!.inputTaxWithheld > 0 && (
                  <View style={styles.tableRow}>
                    <Text style={[styles.tableCell, { flex: 3, color: "#4A5568" }]}>WHT withheld from contractor payments</Text>
                    <Text style={[styles.tableCell, styles.tableCellRight, { color: "#4A5568" }]}>({fmt(data.taxSummary!.inputTaxWithheld)})</Text>
                  </View>
                )}
                {(data.taxSummary!.outputTaxAdditive > 0 || data.taxSummary!.inputTaxAdditive > 0) && (
                  <View style={[styles.tableRow, { borderTopWidth: 1, borderTopColor: "#DDE3EC", marginTop: 2 }]}>
                    <Text style={[styles.tableCell, styles.tableCellBold, { flex: 3 }]}>Net VAT Liability (output − input)</Text>
                    <Text style={[styles.tableCell, styles.tableCellBold, styles.tableCellRight]}>{fmt(data.taxSummary!.netVatLiability)}</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 7, color: "#DDE3EC", marginBottom: 12, fontFamily: "Helvetica-Oblique" }}>
                All figures are informational only. Consult your tax adviser for filing obligations.
              </Text>
            </>
          )}

          {/* Section: Notes & Flags */}
          {hasAlerts && (
            <>
              <SectionHeading num={SEC.alerts} title="Notes & Flags" />
              {data.alerts.map((alert, i) => (
                <AlertCard key={i} alert={alert} />
              ))}
            </>
          )}

        </View>
        <PageFooter {...footerProps} />
      </Page>

    </Document>
  );
}
