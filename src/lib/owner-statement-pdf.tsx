import "server-only";
import "@/lib/pdf-setup";
import React from "react";
import { renderToBuffer, Document, Page, Text, View, StyleSheet, DocumentProps } from "@react-pdf/renderer";
import type { JSXElementConstructor, ReactElement } from "react";
import { formatCurrency } from "@/lib/currency";
import type { OwnerStatement } from "@/lib/owner-statement";

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: "#1a1a2e", padding: 48 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#132635" },
  subtitle: { fontSize: 9, color: "#6b7280", marginTop: 3 },
  periodLabel: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#c9a84c", textAlign: "right" },
  generated: { fontSize: 8, color: "#9ca3af", textAlign: "right", marginTop: 2 },
  sectionLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 5, marginTop: 14 },
  tableHeader: { flexDirection: "row", backgroundColor: "#132635", paddingVertical: 5, paddingHorizontal: 6, borderRadius: 3 },
  th: { color: "#ffffff", fontSize: 8, fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  td: { fontSize: 8.5, color: "#374151" },
  tdRight: { fontSize: 8.5, color: "#374151", textAlign: "right" },
  colTenant: { width: "30%" },
  colUnit: { width: "12%" },
  colNum: { width: "14.5%", textAlign: "right" },
  summary: { marginTop: 16, borderTopWidth: 2, borderTopColor: "#132635", paddingTop: 8 },
  sumRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  sumLabel: { fontSize: 9.5, color: "#6b7280" },
  sumValue: { fontSize: 9.5, color: "#1a1a2e", fontFamily: "Helvetica-Bold" },
  netRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, backgroundColor: "#f8f5ec", padding: 10, borderRadius: 4 },
  netLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#132635" },
  netValue: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#15803d" },
  notes: { marginTop: 14, fontSize: 8, color: "#9ca3af", lineHeight: 1.5 },
  footer: { position: "absolute", bottom: 28, left: 48, right: 48, borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 8 },
  footerText: { fontSize: 7.5, color: "#9ca3af", textAlign: "center" },
});

function StatementDoc({ s }: { s: OwnerStatement }) {
  const fmt = (n: number) => formatCurrency(n, s.currency);
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Owner Statement</Text>
            <Text style={styles.subtitle}>
              {s.propertyName}
              {s.ownerName ? ` · Prepared for ${s.ownerName}` : ""}
            </Text>
          </View>
          <View>
            <Text style={styles.periodLabel}>{s.period}</Text>
            <Text style={styles.generated}>Generated {s.generatedAt}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Income by unit</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colTenant]}>Tenant</Text>
          <Text style={[styles.th, styles.colUnit]}>Unit</Text>
          <Text style={[styles.th, styles.colNum]}>Rent due</Text>
          <Text style={[styles.th, styles.colNum]}>Rent received</Text>
          <Text style={[styles.th, styles.colNum]}>Service / other</Text>
          <Text style={[styles.th, styles.colNum]}>Total</Text>
        </View>
        {s.lines.map((l, i) => (
          <View key={i} style={styles.tr} wrap={false}>
            <Text style={[styles.td, styles.colTenant]}>{l.tenantName}</Text>
            <Text style={[styles.td, styles.colUnit]}>{l.unit}</Text>
            <Text style={[styles.tdRight, styles.colNum]}>{l.rentExpected ? fmt(l.rentExpected) : "—"}</Text>
            <Text style={[styles.tdRight, styles.colNum]}>{fmt(l.rentReceived)}</Text>
            <Text style={[styles.tdRight, styles.colNum]}>{fmt(l.serviceCharge + l.otherIncome)}</Text>
            <Text style={[styles.tdRight, styles.colNum]}>{fmt(l.grossTotal)}</Text>
          </View>
        ))}

        {s.expenses.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Expenses</Text>
            {s.expenses.map((e, i) => (
              <View key={i} style={styles.tr} wrap={false}>
                <Text style={[styles.td, { width: "70%" }]}>{e.description}</Text>
                <Text style={[styles.tdRight, { width: "30%" }]}>{fmt(e.amount)}</Text>
              </View>
            ))}
          </>
        )}

        <View style={styles.summary}>
          <View style={styles.sumRow}>
            <Text style={styles.sumLabel}>Gross income</Text>
            <Text style={styles.sumValue}>{fmt(s.grossIncome)}</Text>
          </View>
          <View style={styles.sumRow}>
            <Text style={styles.sumLabel}>Management fee</Text>
            <Text style={styles.sumValue}>− {fmt(s.managementFee)}</Text>
          </View>
          <View style={styles.sumRow}>
            <Text style={styles.sumLabel}>Operating expenses</Text>
            <Text style={styles.sumValue}>− {fmt(s.totalExpenses)}</Text>
          </View>
          <View style={styles.netRow}>
            <Text style={styles.netLabel}>Net payable to owner</Text>
            <Text style={styles.netValue}>{fmt(s.netPayable)}</Text>
          </View>
        </View>

        <Text style={styles.notes}>{s.notes}</Text>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Generated by GroundWorkPM · groundworkpm.com
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generateOwnerStatementPdf(statement: OwnerStatement): Promise<Buffer> {
  const doc = (<StatementDoc s={statement} />) as ReactElement<
    DocumentProps,
    string | JSXElementConstructor<unknown>
  >;
  return Buffer.from(await renderToBuffer(doc));
}
