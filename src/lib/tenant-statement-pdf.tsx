import "server-only";
import { noHyphenation } from "@/lib/pdf-setup";
import React from "react";
import { renderToBuffer, Document, Page, Text, View, StyleSheet, DocumentProps } from "@react-pdf/renderer";
import type { JSXElementConstructor, ReactElement } from "react";
import { formatCurrency } from "@/lib/currency";
import type { TenantStatement, StatementBranding } from "@/lib/tenant-statement";

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: "#1a1a2e", padding: 48, paddingBottom: 64 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#132635" },
  subtitle: { fontSize: 9, color: "#6b7280", marginTop: 3 },
  periodLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#c9a84c", textAlign: "right", maxWidth: 200 },
  generated: { fontSize: 8, color: "#9ca3af", textAlign: "right", marginTop: 2 },
  metaLine: { fontSize: 8, color: "#9ca3af", marginBottom: 14 },
  sectionLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 5, marginTop: 14 },
  tableHeader: { flexDirection: "row", backgroundColor: "#132635", paddingVertical: 5, paddingHorizontal: 6, borderRadius: 3 },
  th: { color: "#ffffff", fontSize: 8, fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", paddingVertical: 4.5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  trMemo: { flexDirection: "row", paddingVertical: 4.5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: "#f3f4f6", backgroundColor: "#fffbeb" },
  trOpening: { flexDirection: "row", paddingVertical: 4.5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: "#e5e7eb", backgroundColor: "#f9fafb" },
  td: { fontSize: 8.5, color: "#374151" },
  tdRight: { fontSize: 8.5, color: "#374151", textAlign: "right" },
  tdMemo: { fontSize: 8, color: "#92400e" },
  // Columns sum to 97% — rows carry paddingHorizontal (see owner-statement-pdf).
  colDate: { width: "13%" },
  colDesc: { width: "42%" },
  colNum: { width: "14%", textAlign: "right" },
  legend: { fontSize: 7.5, color: "#92400e", marginTop: 6, lineHeight: 1.4 },
  summary: { marginTop: 16, borderTopWidth: 2, borderTopColor: "#132635", paddingTop: 8 },
  sumRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  sumLabel: { fontSize: 9.5, color: "#6b7280" },
  sumValue: { fontSize: 9.5, color: "#1a1a2e", fontFamily: "Helvetica-Bold" },
  netRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, padding: 10, borderRadius: 4 },
  netLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#132635" },
  block: { marginTop: 4, backgroundColor: "#f9fafb", borderRadius: 4, padding: 10 },
  blockRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  blockLabel: { fontSize: 8.5, color: "#6b7280" },
  blockValue: { fontSize: 8.5, color: "#1a1a2e" },
  disclaimer: { marginTop: 16, fontSize: 7.5, color: "#9ca3af", lineHeight: 1.5 },
  footer: { position: "absolute", bottom: 28, left: 48, right: 48, borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 8 },
  footerText: { fontSize: 7.5, color: "#9ca3af", textAlign: "center" },
});

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function StatementDoc({ s, branding }: { s: TenantStatement; branding: StatementBranding }) {
  const fmt = (n: number) => formatCurrency(n, s.currency);
  const inArrears = s.summary.position === "ARREARS";
  const hasPending = s.summary.awaitingConfirmation.count > 0;
  const paymentDetails = [
    branding.bankName ? `Bank: ${branding.bankName}` : null,
    branding.bankAccountName ? `Account name: ${branding.bankAccountName}` : null,
    branding.bankAccountNumber ? `Account no: ${branding.bankAccountNumber}` : null,
    branding.bankBranch ? `Branch: ${branding.bankBranch}` : null,
    branding.mpesaPaybill ? `M-Pesa Paybill: ${branding.mpesaPaybill}` : null,
    branding.mpesaAccountNumber ? `M-Pesa Account: ${branding.mpesaAccountNumber}` : null,
    branding.mpesaTill ? `M-Pesa Till: ${branding.mpesaTill}` : null,
  ].filter(Boolean) as string[];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Statement of Account</Text>
            <Text style={styles.subtitle} hyphenationCallback={noHyphenation}>
              {s.tenantName} · Unit {s.unitNumber} · {s.propertyName}
            </Text>
            {branding.orgName ? <Text style={styles.subtitle}>{branding.orgName}</Text> : null}
          </View>
          <View>
            <Text style={styles.periodLabel} hyphenationCallback={noHyphenation}>{s.period.label}</Text>
            <Text style={styles.generated}>Generated {fmtDay(s.generatedAt)}</Text>
          </View>
        </View>
        <Text style={styles.metaLine}>
          Records as at {fmtDay(s.recordsAsAt)} · Period {fmtDay(s.period.start)} – {fmtDay(s.period.end)}
        </Text>

        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colDate]}>Date</Text>
          <Text style={[styles.th, styles.colDesc]}>Description</Text>
          <Text style={[styles.th, styles.colNum]}>Charges</Text>
          <Text style={[styles.th, styles.colNum]}>Payments</Text>
          <Text style={[styles.th, styles.colNum]}>Balance</Text>
        </View>
        {s.lines.map((l, i) => {
          if (l.kind === "PROOF_PENDING") {
            return (
              <View key={i} style={styles.trMemo} wrap={false}>
                <Text style={[styles.tdMemo, styles.colDate]}>{fmtDay(l.date)}</Text>
                <Text style={[styles.tdMemo, { width: "56%" }]} hyphenationCallback={noHyphenation}>
                  * Payment asserted for {l.reference} — awaiting confirmation ({l.daysAwaiting} day{l.daysAwaiting === 1 ? "" : "s"})
                </Text>
                <Text style={[styles.tdMemo, styles.colNum, { width: "28%" }]}>memo only</Text>
              </View>
            );
          }
          const rowStyle = l.kind === "OPENING_BALANCE" ? styles.trOpening : styles.tr;
          return (
            <View key={i} style={rowStyle} wrap={false}>
              <Text style={[styles.td, styles.colDate]}>{fmtDay(l.date)}</Text>
              <Text style={[styles.td, styles.colDesc]} hyphenationCallback={noHyphenation}>
                {l.kind === "PAYMENT" && l.unallocated ? `${l.description} (unallocated)` : l.description}
                {l.kind === "PAYMENT" && l.paymentMethod ? ` · ${l.paymentMethod.replace(/_/g, " ")}` : ""}
              </Text>
              <Text style={[styles.tdRight, styles.colNum]}>{l.charge != null ? fmt(l.charge) : ""}</Text>
              <Text style={[styles.tdRight, styles.colNum]}>{l.payment != null ? fmt(l.payment) : ""}</Text>
              <Text style={[styles.tdRight, styles.colNum]}>{l.balance != null ? fmt(l.balance) : ""}</Text>
            </View>
          );
        })}
        {hasPending ? (
          <Text style={styles.legend} hyphenationCallback={noHyphenation}>
            * Awaiting confirmation — you have submitted proof of payment and your manager has not yet
            confirmed receipt. These amounts are shown for information only: they do not reduce the
            balance on this statement until confirmed.
          </Text>
        ) : null}

        <View style={styles.summary}>
          <View style={styles.sumRow}>
            <Text style={styles.sumLabel}>Balance brought forward</Text>
            <Text style={styles.sumValue}>{fmt(s.openingBalance)}</Text>
          </View>
          <View style={styles.sumRow}>
            <Text style={styles.sumLabel}>Invoiced this period</Text>
            <Text style={styles.sumValue}>{fmt(s.summary.totalInvoiced)}</Text>
          </View>
          {s.breakdown.lateFees > 0 ? (
            <View style={styles.sumRow}>
              <Text style={styles.sumLabel}>— of which late payment fees</Text>
              <Text style={styles.sumValue}>{fmt(s.breakdown.lateFees)}</Text>
            </View>
          ) : null}
          <View style={styles.sumRow}>
            <Text style={styles.sumLabel}>Payments received this period</Text>
            <Text style={styles.sumValue}>− {fmt(s.summary.totalPaid)}</Text>
          </View>
          {hasPending ? (
            <View style={styles.sumRow}>
              <Text style={styles.sumLabel}>
                {s.summary.awaitingConfirmation.count} payment{s.summary.awaitingConfirmation.count === 1 ? "" : "s"} awaiting confirmation *
              </Text>
              <Text style={styles.sumValue}>({fmt(s.summary.awaitingConfirmation.total)})</Text>
            </View>
          ) : null}
          <View style={[styles.netRow, { backgroundColor: inArrears ? "#fef2f2" : "#f0fdf4" }]}>
            <Text style={styles.netLabel}>
              {s.summary.position === "ARREARS"
                ? "Balance owing (in arrears)"
                : s.summary.position === "CREDIT"
                  ? "Balance in your favour (in credit)"
                  : "Closing balance (settled)"}
            </Text>
            <Text style={[styles.netLabel, { color: inArrears ? "#b91c1c" : "#15803d" }]}>
              {fmt(Math.abs(s.summary.closingBalance))}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Deposit</Text>
        <View style={styles.block}>
          <View style={styles.blockRow}>
            <Text style={styles.blockLabel}>Contractual deposit</Text>
            <Text style={styles.blockValue}>{fmt(s.deposit.contractual)}</Text>
          </View>
          <View style={styles.blockRow}>
            <Text style={styles.blockLabel}>Deposit received on record</Text>
            <Text style={styles.blockValue}>
              {s.deposit.received != null ? fmt(s.deposit.received) : "No receipt trail recorded"}
            </Text>
          </View>
          {s.deposit.checkout ? (
            <>
              <View style={styles.blockRow}>
                <Text style={styles.blockLabel}>
                  Checkout deductions{s.deposit.checkout.provisional ? " (PROVISIONAL — checkout in progress)" : ""}
                </Text>
                <Text style={styles.blockValue}>− {fmt(s.deposit.checkout.totalDeductions)}</Text>
              </View>
              {s.deposit.checkout.deductions.map((d, i) => (
                <View key={i} style={styles.blockRow}>
                  <Text style={[styles.blockLabel, { paddingLeft: 10 }]} hyphenationCallback={noHyphenation}>
                    {d.description}
                  </Text>
                  <Text style={styles.blockValue}>− {fmt(d.amount)}</Text>
                </View>
              ))}
              <View style={styles.blockRow}>
                <Text style={styles.blockLabel}>
                  Balance to refund{s.deposit.checkout.provisional ? " (provisional)" : ""}
                </Text>
                <Text style={styles.blockValue}>{fmt(s.deposit.checkout.balanceToRefund)}</Text>
              </View>
            </>
          ) : null}
          {s.deposit.settlement ? (
            <>
              <View style={styles.blockRow}>
                <Text style={styles.blockLabel}>Deposit settled on {fmtDay(s.deposit.settlement.settledDate)}</Text>
                <Text style={styles.blockValue}>held {fmt(s.deposit.settlement.depositHeld)}</Text>
              </View>
              <View style={styles.blockRow}>
                <Text style={styles.blockLabel}>Deductions at settlement</Text>
                <Text style={styles.blockValue}>− {fmt(s.deposit.settlement.totalDeductions)}</Text>
              </View>
              <View style={styles.blockRow}>
                <Text style={styles.blockLabel}>Net refunded</Text>
                <Text style={styles.blockValue}>{fmt(s.deposit.settlement.netRefunded)}</Text>
              </View>
            </>
          ) : null}
        </View>

        {inArrears && (paymentDetails.length > 0 || branding.paymentInstructions) ? (
          <>
            <Text style={styles.sectionLabel}>How to pay</Text>
            <View style={styles.block}>
              {paymentDetails.map((line, i) => (
                <Text key={i} style={[styles.blockValue, { paddingVertical: 1.5 }]}>{line}</Text>
              ))}
              {branding.paymentInstructions ? (
                <Text style={[styles.blockLabel, { marginTop: 4 }]} hyphenationCallback={noHyphenation}>
                  {branding.paymentInstructions}
                </Text>
              ) : null}
            </View>
          </>
        ) : null}

        <Text style={styles.disclaimer} hyphenationCallback={noHyphenation}>
          This is a statement of account, not a final reconciliation or a tax document. It reflects
          records held as at {fmtDay(s.recordsAsAt)} and was generated on {fmtDay(s.generatedAt)}.
          If anything on this statement looks incorrect or incomplete — a payment you made that is not
          shown, a charge you don&apos;t recognise — please raise it with your property manager
          {branding.email ? ` (${branding.email})` : ""} so the records can be corrected.
        </Text>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {branding.orgName ? `${branding.orgName} · ` : ""}Generated by GroundWorkPM · groundworkpm.com
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generateTenantStatementPdf(
  statement: TenantStatement,
  branding: StatementBranding,
): Promise<Buffer> {
  const doc = (<StatementDoc s={statement} branding={branding} />) as ReactElement<
    DocumentProps,
    string | JSXElementConstructor<unknown>
  >;
  return Buffer.from(await renderToBuffer(doc));
}
