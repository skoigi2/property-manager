import "server-only";
import React from "react";
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatCurrency } from "@/lib/currency";
import {
  compareStrategies,
  interpretBreakeven,
  calcAirbnb,
  type CalculatorInputs,
} from "@/lib/rental-calculator";

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: "#1a1a2e", padding: 48 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  brand: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#c9a84c", letterSpacing: 1 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#132635", marginTop: 4 },
  subtitle: { fontSize: 9, color: "#6b7280", marginTop: 3 },
  generated: { fontSize: 8, color: "#9ca3af", textAlign: "right" },
  sectionLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, marginTop: 16 },
  para: { fontSize: 9, color: "#374151", lineHeight: 1.6, marginBottom: 6 },
  bigCallout: { backgroundColor: "#132635", borderRadius: 6, padding: 16, marginTop: 8, marginBottom: 4 },
  bigCalloutLabel: { fontSize: 8, color: "#c9a84c", fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.8 },
  bigCalloutValue: { fontSize: 26, fontFamily: "Helvetica-Bold", color: "#ffffff", marginTop: 4 },
  bigCalloutNote: { fontSize: 8.5, color: "#d1d5db", marginTop: 4, lineHeight: 1.5 },
  twoCol: { flexDirection: "row", gap: 12, marginTop: 4 },
  col: { flex: 1, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 6, padding: 12 },
  colWin: { flex: 1, borderWidth: 1.5, borderColor: "#c9a84c", backgroundColor: "#fdfaf2", borderRadius: 6, padding: 12 },
  colTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#132635", marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5, borderBottomWidth: 0.5, borderBottomColor: "#f3f4f6" },
  rowLabel: { fontSize: 8.5, color: "#6b7280" },
  rowValue: { fontSize: 8.5, color: "#1a1a2e" },
  rowValueBold: { fontSize: 9, color: "#1a1a2e", fontFamily: "Helvetica-Bold" },
  tableHeader: { flexDirection: "row", backgroundColor: "#132635", paddingVertical: 5, paddingHorizontal: 8, borderRadius: 3, marginTop: 4 },
  th: { color: "#ffffff", fontSize: 8, fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", paddingVertical: 4.5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  trBad: { flexDirection: "row", paddingVertical: 4.5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: "#f3f4f6", backgroundColor: "#fef2f2" },
  td: { fontSize: 8.5, color: "#374151" },
  tdRight: { fontSize: 8.5, color: "#374151", textAlign: "right" },
  tdRightRed: { fontSize: 8.5, color: "#dc2626", textAlign: "right", fontFamily: "Helvetica-Bold" },
  tdRightGreen: { fontSize: 8.5, color: "#15803d", textAlign: "right", fontFamily: "Helvetica-Bold" },
  verdictBox: { borderWidth: 1.5, borderColor: "#c9a84c", borderRadius: 6, padding: 14, marginTop: 6 },
  verdictTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#132635" },
  footer: { position: "absolute", bottom: 28, left: 48, right: 48, borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 8 },
  footerText: { fontSize: 7, color: "#9ca3af", textAlign: "center", lineHeight: 1.5 },
});

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={bold ? styles.rowValueBold : styles.rowValue}>{value}</Text>
    </View>
  );
}

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>
        GroundWorkPM · groundworkpm.com · This report provides estimates only and should not replace professional
        financial, tax, or legal advice. Actual results depend on market conditions, local regulations, and execution.
      </Text>
    </View>
  );
}

const VERDICT_COPY: Record<string, { title: string; body: string }> = {
  LONG_TERM_WINS: {
    title: "Recommendation: Long-Term Rental",
    body: "Long-term renting produces similar or better profits with substantially lower operational complexity. You benefit from predictable income, lower vacancy risk, fewer operational demands, and reduced turnover costs.",
  },
  AIRBNB_WINS: {
    title: "Recommendation: Airbnb / Short-Term Rental",
    body: "Even after accounting for the additional effort, Airbnb significantly outperforms long-term renting under your assumptions. Note that this advantage depends on consistently maintaining occupancy above the breakeven level shown above.",
  },
  TOO_CLOSE: {
    title: "Recommendation: Too Close to Call",
    body: "Airbnb generates only modest additional profits under your assumptions. If occupancy falls slightly, long-term renting becomes more profitable. Many investors choose long-term rentals in this situation because the income is simpler and easier to manage.",
  },
};

export async function generateCalculatorReportPdf(
  firstName: string,
  inputs: CalculatorInputs
): Promise<Buffer> {
  const r = compareStrategies(inputs);
  const interp = interpretBreakeven(r.breakevenOccupancyPct);
  const cur = inputs.currency;
  const fmt = (n: number) => formatCurrency(Math.round(n), cur);
  const generatedAt = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const be = r.breakevenOccupancyPct;
  const ltWins = r.verdict === "LONG_TERM_WINS";
  const abWins = r.verdict === "AIRBNB_WINS";
  const verdict = VERDICT_COPY[r.verdict];

  // 10-year simple projection (flat assumptions — no growth speculation)
  const tenYearLt = r.longTerm.annualNoi * 10;
  const tenYearAb = r.airbnb.annualNoi * 10;

  // Low-season stress: occupancy at 60% of estimate
  const lowSeason = calcAirbnb({
    ...inputs.airbnb,
    occupancyRatePct: inputs.airbnb.occupancyRatePct * 0.6,
  });

  const doc = (
    <Document title="Airbnb vs Long-Term Rental — Investor Report" author="GroundWorkPM">
      {/* ── Page 1: summary + analyses ── */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>GROUNDWORKPM</Text>
            <Text style={styles.title}>Airbnb vs Long-Term Rental</Text>
            <Text style={styles.subtitle}>Personalised investor report prepared for {firstName}</Text>
          </View>
          <Text style={styles.generated}>Generated {generatedAt}</Text>
        </View>

        <Text style={styles.sectionLabel}>Executive summary</Text>
        <Text style={styles.para}>
          Under your assumptions, a long-term tenancy produces a net operating income of {fmt(r.longTerm.monthlyNoi)} per
          month, while operating the same property as an Airbnb produces {fmt(r.airbnb.monthlyNoi)} per month — a
          difference of {fmt(Math.abs(r.airbnb.monthlyNoi - r.longTerm.monthlyNoi))} per month in favour of{" "}
          {r.airbnb.monthlyNoi >= r.longTerm.monthlyNoi ? "Airbnb" : "long-term renting"}. After applying your hassle
          premium of {fmt(inputs.hasslePremiumMonthly)} per month, the hassle-adjusted Airbnb advantage is{" "}
          {fmt(r.hassleAdjustedAdvantage)} per year.
        </Text>

        <View style={styles.bigCallout}>
          <Text style={styles.bigCalloutLabel}>Airbnb breakeven occupancy</Text>
          <Text style={styles.bigCalloutValue}>{be === null ? "Not reachable" : `${be.toFixed(1)}%`}</Text>
          <Text style={styles.bigCalloutNote}>
            {be === null
              ? "With these costs and rates, no occupancy level allows Airbnb to match the long-term result."
              : `Airbnb must achieve approximately ${be.toFixed(1)}% occupancy just to match the profits of long-term renting. ${interp.headline}`}
          </Text>
        </View>

        <Text style={styles.sectionLabel}>Side-by-side analysis</Text>
        <View style={styles.twoCol}>
          <View style={ltWins ? styles.colWin : styles.col}>
            <Text style={styles.colTitle}>Long-Term Rental</Text>
            <Row label="Monthly rent" value={fmt(inputs.longTerm.monthlyRent)} />
            <Row label="Vacancy assumption" value={`${inputs.longTerm.vacancyRatePct}%`} />
            <Row label="Effective gross income" value={fmt(r.longTerm.effectiveGrossIncome)} />
            <Row label="Operating expenses" value={fmt(r.longTerm.totalOperatingExpenses)} />
            <Row label="Annual NOI" value={fmt(r.longTerm.annualNoi)} bold />
            <Row label="Monthly NOI" value={fmt(r.longTerm.monthlyNoi)} bold />
          </View>
          <View style={abWins ? styles.colWin : styles.col}>
            <Text style={styles.colTitle}>Airbnb / Short-Term</Text>
            <Row label="Nightly rate" value={fmt(inputs.airbnb.nightlyRate)} />
            <Row label="Occupancy assumption" value={`${inputs.airbnb.occupancyRatePct}%`} />
            <Row label="Gross revenue" value={fmt(r.airbnb.grossRevenue)} />
            <Row label="Operating expenses" value={fmt(r.airbnb.totalOperatingExpenses)} />
            <Row label="Annual NOI" value={fmt(r.airbnb.annualNoi)} bold />
            <Row label="Monthly NOI" value={fmt(r.airbnb.monthlyNoi)} bold />
          </View>
        </View>

        <Text style={styles.sectionLabel}>Operational workload (Airbnb)</Text>
        <Text style={styles.para}>
          Achieving {inputs.airbnb.occupancyRatePct}% occupancy means roughly {Math.round(r.airbnb.bookedNights)} booked
          nights, {Math.round(r.airbnb.turnovers)} guest turnovers, {Math.round(r.airbnb.turnovers)} cleaning schedules,
          and {Math.round(r.airbnb.turnovers * 2)} check-ins and check-outs per year — plus ongoing guest communication
          and continuous pricing management. Short-term letting is a hospitality business, not passive income.
        </Text>

        <Text style={styles.sectionLabel}>10-year profit comparison (flat assumptions)</Text>
        <Row label="Long-term rental, 10-year cumulative NOI" value={fmt(tenYearLt)} bold />
        <Row label="Airbnb, 10-year cumulative NOI" value={fmt(tenYearAb)} bold />
        <Row label="Cumulative difference" value={fmt(tenYearAb - tenYearLt)} bold />

        <Footer />
      </Page>

      {/* ── Page 2: stress tests + recommendation + GWPM ── */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionLabel}>Stress test scenarios</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, { width: "46%" }]}>Scenario</Text>
          <Text style={[styles.th, { width: "27%", textAlign: "right" }]}>Adjusted Airbnb NOI</Text>
          <Text style={[styles.th, { width: "27%", textAlign: "right" }]}>vs long-term</Text>
        </View>
        {r.stressTests.map((s) => (
          <View key={s.key} style={s.diffVsLongTerm < 0 ? styles.trBad : styles.tr}>
            <Text style={[styles.td, { width: "46%" }]}>{s.label}</Text>
            <Text style={[styles.tdRight, { width: "27%" }]}>{fmt(s.airbnbAnnualNoi)}</Text>
            <Text style={[s.diffVsLongTerm < 0 ? styles.tdRightRed : styles.tdRightGreen, { width: "27%" }]}>
              {s.diffVsLongTerm >= 0 ? "+" : "-"}{fmt(Math.abs(s.diffVsLongTerm))}
            </Text>
          </View>
        ))}
        {be !== null && (
          <Text style={[styles.para, { marginTop: 8 }]}>
            Your Airbnb strategy becomes less profitable than long-term renting if occupancy falls below {be.toFixed(1)}%.
          </Text>
        )}

        <Text style={styles.sectionLabel}>Low-season stress test</Text>
        <Text style={styles.para}>
          If occupancy drops to 60% of your estimate ({(inputs.airbnb.occupancyRatePct * 0.6).toFixed(0)}% occupancy)
          for a full year — a plausible low-season or downturn scenario — Airbnb annual NOI falls to{" "}
          {fmt(lowSeason.annualNoi)}, versus {fmt(r.longTerm.annualNoi)} for the long-term tenancy.
        </Text>

        <Text style={styles.sectionLabel}>Hassle premium</Text>
        <Text style={styles.para}>
          You valued the additional operational effort of short-term letting at {fmt(inputs.hasslePremiumMonthly)} per
          month ({fmt(r.hasslePremiumAnnual)} per year). After this adjustment, the net Airbnb advantage is{" "}
          {fmt(r.hassleAdjustedAdvantage)} per year
          {r.hassleBreakevenOccupancyPct !== null
            ? `, and the occupancy required for Airbnb to be genuinely worth the effort rises to ${r.hassleBreakevenOccupancyPct.toFixed(1)}%.`
            : "."}
        </Text>

        <Text style={styles.sectionLabel}>Key investment risks</Text>
        <Text style={styles.para}>
          1. Occupancy risk — Airbnb income is far more sensitive to demand swings, seasonality, and new competing listings.{"\n"}
          2. Regulatory risk — many cities restrict or licence short-term rentals; rule changes can end the strategy overnight.{"\n"}
          3. Cost-creep risk — cleaning, supplies, and platform fees tend to rise faster than long-term operating costs.{"\n"}
          4. Operational risk — reviews, response times, and turnover quality directly drive revenue; poor execution compounds.{"\n"}
          5. Concentration risk — a single platform policy change (fees, ranking, payouts) can materially affect income.
        </Text>

        <Text style={styles.sectionLabel}>Final recommendation</Text>
        <View style={styles.verdictBox}>
          <Text style={styles.verdictTitle}>{verdict.title}</Text>
          <Text style={[styles.para, { marginTop: 6, marginBottom: 0 }]}>{verdict.body}</Text>
        </View>

        <Text style={styles.sectionLabel}>Run the winning strategy efficiently</Text>
        <Text style={styles.para}>
          Whichever strategy you choose, the investors who win treat their property like a business — tracking every
          payment, expense, and maintenance job against real numbers. GroundWorkPM is the operating system for exactly
          that: rent and booking income tracking, expense management, maintenance coordination, owner reports, and true
          profitability analysis for both long-term and short-let portfolios. Start a free 30-day trial at
          groundworkpm.com — no credit card required.
        </Text>

        <Footer />
      </Page>
    </Document>
  );

  const buf = await renderToBuffer(doc);
  return Buffer.from(buf);
}
