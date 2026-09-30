import "server-only";
import { noHyphenation } from "@/lib/pdf-setup";
import React from "react";
import { renderToBuffer, Document, Page, Text, View, StyleSheet, DocumentProps } from "@react-pdf/renderer";
import type { JSXElementConstructor, ReactElement } from "react";
import { formatCurrency } from "@/lib/currency";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expense-categories";
import { BASIS_LABEL } from "@/lib/service-charge";
import type { ServiceChargeView } from "@/lib/service-charge-data";

// Service charge statement PDF. Two modes off one generator:
//  - property: budget vs actual, every tenant's share / billed / balance, and
//    the landlord's share for vacant days;
//  - tenant:   the block's costs, their unit's share, days, and their balance.

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: "#1a1a2e", padding: 40, paddingBottom: 60 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  title: { fontSize: 17, fontFamily: "Helvetica-Bold", color: "#132635" },
  subtitle: { fontSize: 9, color: "#6b7280", marginTop: 3 },
  periodLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#c9a84c", textAlign: "right" },
  generated: { fontSize: 8, color: "#9ca3af", textAlign: "right", marginTop: 2 },
  section: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: "#132635", marginTop: 14, marginBottom: 6 },
  tableHeader: { flexDirection: "row", backgroundColor: "#132635", paddingVertical: 5, paddingHorizontal: 6, borderRadius: 3 },
  th: { color: "#ffffff", fontSize: 7.5, fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", paddingVertical: 4.5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  trTotal: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 6, backgroundColor: "#f8f5ec", borderRadius: 3, marginTop: 2 },
  td: { fontSize: 8, color: "#374151" },
  tdBold: { fontSize: 8, color: "#1a1a2e", fontFamily: "Helvetica-Bold" },
  tdOwed: { fontSize: 8, color: "#b91c1c", fontFamily: "Helvetica-Bold" },
  tdCredit: { fontSize: 8, color: "#047857", fontFamily: "Helvetica-Bold" },
  summary: { flexDirection: "row", marginBottom: 6 },
  card: { flexGrow: 1, flexBasis: 0, backgroundColor: "#f9fafb", borderRadius: 4, padding: 9, marginRight: 8 },
  cardLast: { flexGrow: 1, flexBasis: 0, backgroundColor: "#f8f5ec", borderRadius: 4, padding: 9 },
  cardLabel: { fontSize: 7.5, color: "#6b7280" },
  cardValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#132635", marginTop: 3 },
  notes: { marginTop: 12, fontSize: 7.5, color: "#6b7280", lineHeight: 1.5 },
  interim: { marginBottom: 10, padding: 7, backgroundColor: "#fffbeb", borderRadius: 3, fontSize: 8, color: "#92400e" },
  footer: { position: "absolute", bottom: 26, left: 40, right: 40, borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 7 },
  footerText: { fontSize: 7.5, color: "#9ca3af", textAlign: "center" },
});

// Column widths sum to ≤ 97% (react-pdf dropped-wrapped-text bug — pdf-setup.ts).
const B = { cat: "37%", num: "15%" } as const;
const S = { unit: "8%", tenant: "23%", days: "7%", num: "11.8%" } as const;

const right = { textAlign: "right" as const };
const generatedOn = () => new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const catLabel = (c: string) => (EXPENSE_CATEGORY_LABELS as Record<string, string>)[c] ?? c;

export interface ServiceChargePdfInput {
  view: ServiceChargeView;
  /** Tenant mode: that tenant's row. */
  tenantId?: string;
}

function CostTable({ view, fmt }: { view: ServiceChargeView; fmt: (n: number) => string }) {
  const b = view.budgetVsActual;
  return (
    <View>
      <View style={styles.tableHeader} fixed>
        <Text style={[styles.th, { width: B.cat }]}>Cost</Text>
        <Text style={[styles.th, { width: B.num }, right]}>Budget</Text>
        <Text style={[styles.th, { width: B.num }, right]}>Budget to date</Text>
        <Text style={[styles.th, { width: B.num }, right]}>Actual</Text>
        <Text style={[styles.th, { width: B.num }, right]}>Variance</Text>
      </View>
      {b.rows.map((r) => (
        <View key={r.category} style={styles.tr} wrap={false}>
          <Text style={[styles.td, { width: B.cat }]}>{catLabel(r.category)}</Text>
          <Text style={[styles.td, { width: B.num }, right]}>{fmt(r.budget)}</Text>
          <Text style={[styles.td, { width: B.num }, right]}>{fmt(r.budgetToDate)}</Text>
          <Text style={[styles.tdBold, { width: B.num }, right]}>{fmt(r.actual)}</Text>
          <Text style={[r.variance > 0 ? styles.tdOwed : styles.td, { width: B.num }, right]}>{r.variance > 0 ? "+" : ""}{fmt(r.variance)}</Text>
        </View>
      ))}
      <View style={styles.trTotal} wrap={false}>
        <Text style={[styles.tdBold, { width: B.cat }]}>Total</Text>
        <Text style={[styles.tdBold, { width: B.num }, right]}>{fmt(b.totals.budget)}</Text>
        <Text style={[styles.tdBold, { width: B.num }, right]}>{fmt(b.totals.budgetToDate)}</Text>
        <Text style={[styles.tdBold, { width: B.num }, right]}>{fmt(b.totals.actual)}</Text>
        <Text style={[b.totals.variance > 0 ? styles.tdOwed : styles.tdBold, { width: B.num }, right]}>{b.totals.variance > 0 ? "+" : ""}{fmt(b.totals.variance)}</Text>
      </View>
    </View>
  );
}

function Doc({ input }: { input: ServiceChargePdfInput }) {
  const { view } = input;
  const fmt = (n: number) => formatCurrency(n, view.property.currency);
  const s = view.statement;
  const row = input.tenantId ? s.rows.find((r) => r.tenantId === input.tenantId) ?? null : null;
  const tenantMode = !!input.tenantId;
  const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
  const asOfLabel = s.asOf.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <Document title={`Service charge statement ${view.period.label}`}>
      <Page size="A4" orientation={tenantMode ? "portrait" : "landscape"} style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Service Charge Statement</Text>
            <Text style={styles.subtitle}>
              {row ? `${row.tenantName} · Unit ${row.unitNumber} · ${view.property.name}` : view.property.name}
            </Text>
          </View>
          <View>
            <Text style={styles.periodLabel}>{view.period.label}</Text>
            <Text style={styles.generated}>Generated {generatedOn()}</Text>
          </View>
        </View>

        {!s.yearEnded && (
          <Text style={styles.interim}>
            Interim statement — costs and occupancy to {asOfLabel}. The final figures follow at the end of the service charge year.
          </Text>
        )}

        {row ? (
          <View>
            <View style={styles.summary}>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Your share of the costs</Text>
                <Text style={styles.cardValue}>{fmt(row.share)}</Text>
                <Text style={styles.cardLabel}>{pct(row.unitShare)} of the block · {row.days} days</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Service charge billed</Text>
                <Text style={styles.cardValue}>{fmt(row.billed)}</Text>
                <Text style={styles.cardLabel}>Paid {fmt(row.paid)}</Text>
              </View>
              <View style={styles.cardLast}>
                <Text style={styles.cardLabel}>{row.balance > 0.005 ? "Balancing charge due" : row.balance < -0.005 ? "Credit due to you" : "Balance"}</Text>
                <Text style={styles.cardValue}>{fmt(Math.abs(row.balance))}</Text>
              </View>
            </View>
            <Text style={styles.section}>What the building cost</Text>
            <CostTable view={view} fmt={fmt} />
            <Text style={styles.notes} hyphenationCallback={noHyphenation}>
              Your share = total actual cost {fmt(s.actualTotal)} × your unit&apos;s share {pct(row.unitShare)} ({BASIS_LABEL[view.budget.basisUsed].toLowerCase()})
              × {row.days} of {s.daysCovered} days. Balance = your share - the service charge billed for the period.
              {row.outstanding > 0.005 ? ` Service charge still unpaid on your invoices: ${fmt(row.outstanding)}.` : ""}
            </Text>
          </View>
        ) : tenantMode ? (
          <Text style={styles.td}>This tenant was not in occupation during the period.</Text>
        ) : (
          <View>
            <View style={styles.summary}>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Budget</Text>
                <Text style={styles.cardValue}>{fmt(view.budget.total)}</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Actual cost</Text>
                <Text style={styles.cardValue}>{fmt(s.actualTotal)}</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Billed on account</Text>
                <Text style={styles.cardValue}>{fmt(s.totals.billed)}</Text>
              </View>
              <View style={styles.cardLast}>
                <Text style={styles.cardLabel}>Charges / credits</Text>
                <Text style={styles.cardValue}>{fmt(s.totals.charges)} / {fmt(s.totals.credits)}</Text>
              </View>
            </View>

            <Text style={styles.section}>Budget vs actual</Text>
            <CostTable view={view} fmt={fmt} />

            <Text style={styles.section}>Tenants — {BASIS_LABEL[view.budget.basisUsed].toLowerCase()}</Text>
            <View style={styles.tableHeader} fixed>
              <Text style={[styles.th, { width: S.unit }]}>Unit</Text>
              <Text style={[styles.th, { width: S.tenant }]}>Tenant</Text>
              <Text style={[styles.th, { width: S.days }, right]}>Days</Text>
              <Text style={[styles.th, { width: S.num }, right]}>Unit share</Text>
              <Text style={[styles.th, { width: S.num }, right]}>Share of cost</Text>
              <Text style={[styles.th, { width: S.num }, right]}>Billed</Text>
              <Text style={[styles.th, { width: S.num }, right]}>Paid</Text>
              <Text style={[styles.th, { width: S.num }, right]}>Balance</Text>
            </View>
            {s.rows.map((r) => (
              <View key={r.tenantId} style={styles.tr} wrap={false}>
                <Text style={[styles.td, { width: S.unit }]}>{r.unitNumber}</Text>
                <Text style={[styles.td, { width: S.tenant }]} hyphenationCallback={noHyphenation}>{r.tenantName}</Text>
                <Text style={[styles.td, { width: S.days }, right]}>{r.days}</Text>
                <Text style={[styles.td, { width: S.num }, right]}>{pct(r.unitShare)}</Text>
                <Text style={[styles.td, { width: S.num }, right]}>{fmt(r.share)}</Text>
                <Text style={[styles.td, { width: S.num }, right]}>{fmt(r.billed)}</Text>
                <Text style={[styles.td, { width: S.num }, right]}>{fmt(r.paid)}</Text>
                <Text style={[r.balance > 0.005 ? styles.tdOwed : r.balance < -0.005 ? styles.tdCredit : styles.td, { width: S.num }, right]}>
                  {r.balance > 0.005 ? `${fmt(r.balance)} due` : r.balance < -0.005 ? `${fmt(-r.balance)} credit` : "—"}
                </Text>
              </View>
            ))}
            {s.landlord.map((l) => (
              <View key={l.unitId} style={styles.tr} wrap={false}>
                <Text style={[styles.td, { width: S.unit }]}>{l.unitNumber}</Text>
                <Text style={[styles.td, { width: S.tenant }]}>Landlord (vacant)</Text>
                <Text style={[styles.td, { width: S.days }, right]}>{l.vacantDays}</Text>
                <Text style={[styles.td, { width: S.num }, right]} />
                <Text style={[styles.td, { width: S.num }, right]}>{fmt(l.share)}</Text>
                <Text style={[styles.td, { width: S.num }, right]} />
                <Text style={[styles.td, { width: S.num }, right]} />
                <Text style={[styles.td, { width: S.num }, right]} />
              </View>
            ))}
            <Text style={styles.notes}>
              Actual cost = expenses recorded against the property (not a single unit) in the budgeted categories, including VAT.
              Each tenant&apos;s share = actual cost × their unit&apos;s share × days occupied ÷ {s.daysCovered}. Vacant days are the landlord&apos;s share.
              Balance = share - service charge billed for the period.
            </Text>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{view.orgName ?? view.property.name} · Service charge statement {view.period.label}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generateServiceChargePdf(input: ServiceChargePdfInput): Promise<Buffer> {
  const element = React.createElement(Doc, { input }) as ReactElement<DocumentProps, string | JSXElementConstructor<unknown>>;
  return Buffer.from(await renderToBuffer(element));
}
