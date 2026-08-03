import "server-only";
import { noHyphenation } from "@/lib/pdf-setup";
import React from "react";
import { renderToBuffer, Document, Page, Text, View, StyleSheet, DocumentProps } from "@react-pdf/renderer";
import type { JSXElementConstructor, ReactElement } from "react";
import { formatCurrency } from "@/lib/currency";
import type { VendorStatement } from "@/lib/vendor-statement";

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: "#1a1a2e", padding: 48, paddingBottom: 64 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#132635" },
  subtitle: { fontSize: 9, color: "#6b7280", marginTop: 3 },
  periodLabel: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#c9a84c", textAlign: "right" },
  generated: { fontSize: 8, color: "#9ca3af", textAlign: "right", marginTop: 2 },
  tableHeader: { flexDirection: "row", backgroundColor: "#132635", paddingVertical: 5, paddingHorizontal: 6, borderRadius: 3 },
  th: { color: "#ffffff", fontSize: 8, fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  trOpening: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 6, backgroundColor: "#f8f5ec", borderRadius: 3 },
  td: { fontSize: 8.5, color: "#374151" },
  tdMuted: { fontSize: 8, color: "#9ca3af" },
  tdRight: { fontSize: 8.5, color: "#374151", textAlign: "right" },
  // Columns sum to 97% — the row carries paddingHorizontal, and columns that
  // overflow the padded width get yoga-shrunk, which triggers the react-pdf
  // dropped-wrapped-text bug (see pdf-setup.ts).
  colDate: { width: "12%" },
  colDesc: { width: "37%" },
  colNum: { width: "16%", textAlign: "right" },
  summary: { marginTop: 16, borderTopWidth: 2, borderTopColor: "#132635", paddingTop: 8 },
  sumRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  sumLabel: { fontSize: 9.5, color: "#6b7280" },
  sumValue: { fontSize: 9.5, color: "#1a1a2e", fontFamily: "Helvetica-Bold" },
  netRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, backgroundColor: "#f8f5ec", padding: 10, borderRadius: 4 },
  netLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#132635" },
  netOwed: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#b91c1c" },
  netClear: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#15803d" },
  notes: { marginTop: 14, fontSize: 8, color: "#9ca3af", lineHeight: 1.5 },
  footer: { position: "absolute", bottom: 28, left: 48, right: 48, borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 8 },
  footerText: { fontSize: 7.5, color: "#9ca3af", textAlign: "center" },
});

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function StatementDoc({ s, periodLabel }: { s: VendorStatement; periodLabel: string }) {
  const fmt = (n: number) => formatCurrency(n, s.currency);
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Vendor Statement</Text>
            <Text style={styles.subtitle}>{s.vendor.name}</Text>
          </View>
          <View>
            <Text style={styles.periodLabel}>{periodLabel}</Text>
            <Text style={styles.generated}>
              Generated {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
            </Text>
          </View>
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colDate]}>Date</Text>
          <Text style={[styles.th, styles.colDesc]}>Description</Text>
          <Text style={[styles.th, styles.colNum]}>Invoiced</Text>
          <Text style={[styles.th, styles.colNum]}>Paid</Text>
          <Text style={[styles.th, styles.colNum]}>Balance</Text>
        </View>

        <View style={styles.trOpening}>
          <Text style={[styles.td, { width: "84%" }]}>Opening balance</Text>
          <Text style={[styles.tdRight, styles.colNum]}>{fmt(s.openingBalance)}</Text>
        </View>

        {s.lines.map((l) => (
          <View key={`${l.type}-${l.refId}`} style={styles.tr} wrap={false}>
            <Text style={[styles.td, styles.colDate]}>{fmtDate(l.date)}</Text>
            <View style={styles.colDesc}>
              <Text style={styles.td} hyphenationCallback={noHyphenation}>{l.description}</Text>
              {(l.propertyName || l.reference) && (
                <Text style={styles.tdMuted} hyphenationCallback={noHyphenation}>
                  {[l.propertyName, l.reference].filter(Boolean).join(" · ")}
                </Text>
              )}
            </View>
            <Text style={[styles.tdRight, styles.colNum]}>{l.type === "INVOICE" ? fmt(l.invoiced) : ""}</Text>
            <Text style={[styles.tdRight, styles.colNum]}>{l.type === "PAYMENT" ? fmt(l.paid) : ""}</Text>
            <Text style={[styles.tdRight, styles.colNum]}>{fmt(l.balance)}</Text>
          </View>
        ))}

        <View style={styles.summary} wrap={false}>
          <View style={styles.sumRow}>
            <Text style={styles.sumLabel}>Invoiced this period</Text>
            <Text style={styles.sumValue}>{fmt(s.totals.invoiced)}</Text>
          </View>
          <View style={styles.sumRow}>
            <Text style={styles.sumLabel}>Paid this period</Text>
            <Text style={styles.sumValue}>− {fmt(s.totals.paid)}</Text>
          </View>
          <View style={styles.netRow}>
            <Text style={styles.netLabel}>Balance owed to vendor</Text>
            <Text style={s.totals.outstanding > 0 ? styles.netOwed : styles.netClear}>
              {fmt(s.totals.outstanding)}
            </Text>
          </View>
        </View>

        <Text style={styles.notes} hyphenationCallback={noHyphenation}>
          Computed from recorded expense invoices and vendor payments.
          {s.mixedCurrencies
            ? " WARNING: this vendor's invoices span properties with different currencies — totals are a raw cross-currency sum."
            : ""}
        </Text>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Generated by GroundWorkPM · groundworkpm.com</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generateVendorStatementPdf(
  statement: VendorStatement,
  periodLabel: string
): Promise<Buffer> {
  const doc = (<StatementDoc s={statement} periodLabel={periodLabel} />) as ReactElement<
    DocumentProps,
    string | JSXElementConstructor<unknown>
  >;
  return Buffer.from(await renderToBuffer(doc));
}
