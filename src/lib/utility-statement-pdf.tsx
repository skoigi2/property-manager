import "server-only";
import { noHyphenation } from "@/lib/pdf-setup";
import React from "react";
import { renderToBuffer, Document, Page, Text, View, StyleSheet, DocumentProps } from "@react-pdf/renderer";
import type { JSXElementConstructor, ReactElement } from "react";
import { formatCurrency } from "@/lib/currency";
import { periodLabel as fmtPeriod, type UtilityStatement, type StatementTenantRow } from "@/lib/utility-statement";
import type { TenantReadingRow } from "@/lib/utility-statement-data";

// Water & electricity statement PDF. Two modes off one generator:
//  - property: every tenant's billed / paid / unpaid — the chase list;
//  - tenant:   one tenant's readings month by month with what is still owed.

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: "#1a1a2e", padding: 40, paddingBottom: 60 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  title: { fontSize: 17, fontFamily: "Helvetica-Bold", color: "#132635" },
  subtitle: { fontSize: 9, color: "#6b7280", marginTop: 3 },
  periodLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#c9a84c", textAlign: "right" },
  generated: { fontSize: 8, color: "#9ca3af", textAlign: "right", marginTop: 2 },
  tableHeader: { flexDirection: "row", backgroundColor: "#132635", paddingVertical: 5, paddingHorizontal: 6, borderRadius: 3 },
  th: { color: "#ffffff", fontSize: 7.5, fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", paddingVertical: 4.5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  trTotal: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 6, backgroundColor: "#f8f5ec", borderRadius: 3, marginTop: 2 },
  td: { fontSize: 8, color: "#374151" },
  tdBold: { fontSize: 8, color: "#1a1a2e", fontFamily: "Helvetica-Bold" },
  tdOwed: { fontSize: 8, color: "#b91c1c", fontFamily: "Helvetica-Bold" },
  tdMuted: { fontSize: 7.5, color: "#9ca3af" },
  summary: { flexDirection: "row", marginBottom: 14 },
  card: { flexGrow: 1, flexBasis: 0, backgroundColor: "#f9fafb", borderRadius: 4, padding: 9, marginRight: 8 },
  cardLast: { flexGrow: 1, flexBasis: 0, backgroundColor: "#fef2f2", borderRadius: 4, padding: 9 },
  cardLabel: { fontSize: 7.5, color: "#6b7280" },
  cardValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#132635", marginTop: 3 },
  cardValueOwed: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#b91c1c", marginTop: 3 },
  notes: { marginTop: 12, fontSize: 7.5, color: "#9ca3af", lineHeight: 1.5 },
  footer: { position: "absolute", bottom: 26, left: 40, right: 40, borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 7 },
  footerText: { fontSize: 7.5, color: "#9ca3af", textAlign: "center" },
});

// Column widths sum to 97% (the row is padded; overflow triggers the
// react-pdf dropped-wrapped-text bug — see pdf-setup.ts).
const P = { unit: "9%", tenant: "20%", num: "10%", oldest: "10%", phone: "8%" } as const;
const T = { desc: "49%", inv: "16%", amount: "16%", status: "16%" } as const;

const right = { textAlign: "right" as const };
const generatedOn = () => new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export interface UtilityStatementPdfInput {
  propertyName: string;
  orgName: string | null;
  currency: string;
  rangeLabel: string;
  statement: UtilityStatement;
  /** Tenant mode: the single tenant row plus their reading history. */
  tenant?: { row: StatementTenantRow | null; name: string; unitNumber: string; readings: TenantReadingRow[] };
}

const STATUS_LABEL: Record<TenantReadingRow["paymentStatus"], string> = {
  PAID: "Paid",
  PART_PAID: "Part paid",
  UNPAID: "Unpaid",
  NOT_INVOICED: "Not invoiced yet",
};

function Doc({ input }: { input: UtilityStatementPdfInput }) {
  const fmt = (n: number) => formatCurrency(n, input.currency);
  const { statement: s, tenant } = input;
  const figures = tenant
    ? { water: tenant.row?.water ?? { billed: 0, paid: 0, unpaid: 0 }, electricity: tenant.row?.electricity ?? { billed: 0, paid: 0, unpaid: 0 }, unpaid: tenant.row?.totalUnpaid ?? 0 }
    : { water: s.totals.water, electricity: s.totals.electricity, unpaid: s.totals.totalUnpaid };

  return (
    <Document>
      <Page size="A4" orientation={tenant ? "portrait" : "landscape"} style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Water &amp; Electricity Statement</Text>
            <Text style={styles.subtitle}>
              {tenant ? `${tenant.name} · Unit ${tenant.unitNumber} · ${input.propertyName}` : input.propertyName}
            </Text>
          </View>
          <View>
            <Text style={styles.periodLabel}>{input.rangeLabel}</Text>
            <Text style={styles.generated}>Generated {generatedOn()}</Text>
          </View>
        </View>

        <View style={styles.summary}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Water billed</Text>
            <Text style={styles.cardValue}>{fmt(figures.water.billed)}</Text>
            <Text style={styles.tdMuted}>Unpaid {fmt(figures.water.unpaid)}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Electricity billed</Text>
            <Text style={styles.cardValue}>{fmt(figures.electricity.billed)}</Text>
            <Text style={styles.tdMuted}>Unpaid {fmt(figures.electricity.unpaid)}</Text>
          </View>
          <View style={styles.cardLast}>
            <Text style={styles.cardLabel}>{tenant ? "You still owe" : `Unpaid · ${s.totals.tenantsOwing} tenant${s.totals.tenantsOwing === 1 ? "" : "s"}`}</Text>
            <Text style={figures.unpaid > 0 ? styles.cardValueOwed : styles.cardValue}>{fmt(figures.unpaid)}</Text>
          </View>
        </View>

        {tenant ? (
          <View>
            <View style={styles.tableHeader} fixed>
              <Text style={[styles.th, { width: T.desc }]}>Reading</Text>
              <Text style={[styles.th, { width: T.inv }]}>Invoice</Text>
              <Text style={[styles.th, { width: T.amount }, right]}>Amount</Text>
              <Text style={[styles.th, { width: T.status }, right]}>Status</Text>
            </View>
            {tenant.readings.length === 0 && <Text style={[styles.td, { padding: 8 }]}>No approved meter readings in this period.</Text>}
            {tenant.readings.map((r) => (
              <View key={r.id} style={styles.tr} wrap={false}>
                <Text style={[styles.td, { width: T.desc }]} hyphenationCallback={noHyphenation}>{r.description}</Text>
                <Text style={[styles.td, { width: T.inv }]}>{r.invoiceNumber ?? "—"}</Text>
                <Text style={[styles.tdBold, { width: T.amount }, right]}>{fmt(r.amount)}</Text>
                <Text style={[r.paymentStatus === "PAID" ? styles.td : styles.tdOwed, { width: T.status }, right]}>{STATUS_LABEL[r.paymentStatus]}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View>
            <View style={styles.tableHeader} fixed>
              <Text style={[styles.th, { width: P.unit }]}>Unit</Text>
              <Text style={[styles.th, { width: P.tenant }]}>Tenant</Text>
              <Text style={[styles.th, { width: P.num }, right]}>Water billed</Text>
              <Text style={[styles.th, { width: P.num }, right]}>Water unpaid</Text>
              <Text style={[styles.th, { width: P.num }, right]}>Power billed</Text>
              <Text style={[styles.th, { width: P.num }, right]}>Power unpaid</Text>
              <Text style={[styles.th, { width: P.num }, right]}>Total unpaid</Text>
              <Text style={[styles.th, { width: P.oldest }, right]}>Oldest unpaid</Text>
              <Text style={[styles.th, { width: P.phone }, right]}>Invoices</Text>
            </View>
            {s.rows.length === 0 && <Text style={[styles.td, { padding: 8 }]}>No water or electricity has been invoiced in this period.</Text>}
            {s.rows.map((r) => (
              <View key={r.tenantId} style={styles.tr} wrap={false}>
                <Text style={[styles.td, { width: P.unit }]}>{r.unitNumber}</Text>
                <View style={{ width: P.tenant }}>
                  <Text style={styles.td} hyphenationCallback={noHyphenation}>{r.tenantName}{r.isActive ? "" : " (vacated)"}</Text>
                  {r.phone ? <Text style={styles.tdMuted}>{r.phone}</Text> : null}
                </View>
                <Text style={[styles.td, { width: P.num }, right]}>{fmt(r.water.billed)}</Text>
                <Text style={[r.water.unpaid > 0 ? styles.tdOwed : styles.td, { width: P.num }, right]}>{fmt(r.water.unpaid)}</Text>
                <Text style={[styles.td, { width: P.num }, right]}>{fmt(r.electricity.billed)}</Text>
                <Text style={[r.electricity.unpaid > 0 ? styles.tdOwed : styles.td, { width: P.num }, right]}>{fmt(r.electricity.unpaid)}</Text>
                <Text style={[r.totalUnpaid > 0 ? styles.tdOwed : styles.tdBold, { width: P.num }, right]}>{fmt(r.totalUnpaid)}</Text>
                <Text style={[styles.td, { width: P.oldest }, right]}>{fmtPeriod(r.oldestUnpaidPeriod)}</Text>
                <Text style={[styles.td, { width: P.phone }, right]}>{r.unpaidInvoices || "—"}</Text>
              </View>
            ))}
            {s.rows.length > 0 && (
              <View style={styles.trTotal} wrap={false}>
                <Text style={[styles.tdBold, { width: P.unit }]}>Total</Text>
                <Text style={[styles.td, { width: P.tenant }]}>{s.rows.length} tenant{s.rows.length === 1 ? "" : "s"}</Text>
                <Text style={[styles.tdBold, { width: P.num }, right]}>{fmt(s.totals.water.billed)}</Text>
                <Text style={[styles.tdOwed, { width: P.num }, right]}>{fmt(s.totals.water.unpaid)}</Text>
                <Text style={[styles.tdBold, { width: P.num }, right]}>{fmt(s.totals.electricity.billed)}</Text>
                <Text style={[styles.tdOwed, { width: P.num }, right]}>{fmt(s.totals.electricity.unpaid)}</Text>
                <Text style={[styles.tdOwed, { width: P.num }, right]}>{fmt(s.totals.totalUnpaid)}</Text>
                <Text style={[styles.td, { width: P.oldest }]}> </Text>
                <Text style={[styles.td, { width: P.phone }]}> </Text>
              </View>
            )}
          </View>
        )}

        <Text style={styles.notes} hyphenationCallback={noHyphenation}>
          A payment against an invoice settles the rent first, then water, then electricity — so an invoice paid short shows its
          unpaid balance against the utilities. {tenant ? "If anything looks wrong, please contact your property manager." : "Figures are as at the time this statement was generated."}
        </Text>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{input.orgName ?? input.propertyName} · Water &amp; electricity statement</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generateUtilityStatementPdf(input: UtilityStatementPdfInput): Promise<Buffer> {
  const element = React.createElement(Doc, { input }) as ReactElement<DocumentProps, string | JSXElementConstructor<unknown>>;
  return Buffer.from(await renderToBuffer(element));
}
