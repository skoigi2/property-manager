import "server-only";
import { noHyphenation } from "@/lib/pdf-setup";
import React from "react";
import { renderToBuffer, Document, Page, Text, View, Image, StyleSheet, DocumentProps } from "@react-pdf/renderer";
import type { JSXElementConstructor, ReactElement } from "react";
import { format } from "date-fns";

// Payment receipt — one page, one payment event. Built from a group of
// IncomeEntry rows (src/lib/payment-receipt.ts) so a move-in payment shows
// rent + deposit + fees as separate lines on ONE receipt.

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: "#1a1a2e", padding: 56 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  brandBlock: { flex: 1 },
  brandName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#1a1a2e" },
  brandSub: { fontSize: 9, color: "#6b7280", marginTop: 2 },
  receiptLabel: { fontSize: 24, fontFamily: "Helvetica-Bold", color: "#16a34a", textAlign: "right" },
  receiptNum: { fontSize: 10, color: "#6b7280", textAlign: "right", marginTop: 2 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#e5e7eb", marginVertical: 12 },
  stamp: { borderWidth: 2, borderColor: "#16a34a", borderRadius: 6, padding: 10, alignSelf: "center", marginTop: 8, marginBottom: 14 },
  stampPartial: { borderColor: "#d97706" },
  stampText: { color: "#16a34a", fontFamily: "Helvetica-Bold", fontSize: 15, letterSpacing: 1.5, textAlign: "center" },
  stampTextPartial: { color: "#d97706" },
  stampSub: { color: "#15803d", fontSize: 9, textAlign: "center", marginTop: 2 },
  stampSubPartial: { color: "#b45309" },
  sectionLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  bodyText: { fontSize: 10, color: "#374151", lineHeight: 1.5 },
  boldText: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1a1a2e" },
  twoCol: { flexDirection: "row", gap: 24, marginBottom: 14 },
  col: { flex: 1 },
  kv: { flexDirection: "row", marginBottom: 3 },
  kvLabel: { width: 82, color: "#6b7280", fontSize: 9.5 },
  kvValue: { flex: 1, color: "#1a1a2e", fontSize: 9.5 },
  table: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 4, overflow: "hidden", marginBottom: 12 },
  tableHeader: { flexDirection: "row", backgroundColor: "#f3f4f6", paddingVertical: 6, paddingHorizontal: 10 },
  th: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6 },
  tr: { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: "#f3f4f6" },
  tdDesc: { flex: 1, fontSize: 10, color: "#374151" },
  tdAmt: { width: 120, textAlign: "right", fontSize: 10, color: "#1a1a2e" },
  amountBlock: { backgroundColor: "#f0fdf4", borderRadius: 6, padding: 14, marginBottom: 14, alignItems: "center" },
  amountLabel: { fontSize: 9, color: "#15803d", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  amountValue: { fontSize: 22, fontFamily: "Helvetica-Bold", color: "#15803d" },
  infoBox: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 4, padding: 10, marginBottom: 10 },
  row: { flexDirection: "row", paddingVertical: 4 },
  rowLabel: { width: 150, color: "#6b7280", fontSize: 9.5 },
  rowValue: { flex: 1, color: "#1a1a2e", fontFamily: "Helvetica-Bold", fontSize: 9.5 },
  note: { fontSize: 8.5, color: "#6b7280", marginTop: 4, lineHeight: 1.4 },
  footer: { position: "absolute", bottom: 32, left: 56, right: 56 },
  footerDivider: { borderBottomWidth: 1, borderBottomColor: "#e5e7eb", marginBottom: 10 },
  footerText: { fontSize: 8, color: "#9ca3af", textAlign: "center" },
});

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  BANK_TRANSFER: "Bank Transfer",
  MPESA: "M-Pesa",
  CASH: "Cash",
  CARD: "Card",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

export type ReceiptData = {
  receiptNumber: string;
  /** One row per payment component (rent / deposit / fee). */
  lines: { label: string; amount: number }[];
  /** Σ lines — the amount received in this payment event. */
  amount: number;
  paidAt: Date | string;
  paymentMethod?: string | null;
  /** Free-text reference (bank ref, M-Pesa code) — the primary entry's note. */
  reference?: string | null;
  currency?: string;
  /** Present when the payment settles (part of) an invoice. */
  invoice?: {
    invoiceNumber: string;
    periodLabel: string;
    totalAmount: number;
    paidToDate: number;
    outstanding: number;
  } | null;
  /** Present when the payment includes a security deposit. */
  deposit?: { contractual: number; receivedToDate: number } | null;
  stamp: { headline: string; sub: string };
  org?: {
    name: string;
    logoUrl?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  tenant: {
    name: string;
    email?: string | null;
    phone?: string | null;
    unit: {
      unitNumber: string;
      property: { name: string; address?: string | null; city?: string | null; logoUrl?: string | null };
    };
  };
};

function formatMoney(amount: number, currency = "USD") {
  const symbols: Record<string, string> = { KES: "KSh", USD: "$", GBP: "£", EUR: "€", TZS: "TSh", UGX: "USh", ZAR: "R", AED: "AED", INR: "₹", CHF: "CHF" };
  const symbol = symbols[currency] ?? currency;
  return `${symbol} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ReceiptPDF({ data }: { data: ReceiptData }) {
  const currency = data.currency ?? "USD";
  const fmt = (n: number) => formatMoney(n, currency);
  const paidDate = format(new Date(data.paidAt), "d MMMM yyyy");
  const org = data.org;
  const logoUrl = data.tenant.unit.property.logoUrl ?? org?.logoUrl;
  const brandName = org?.name ?? data.tenant.unit.property.name;
  const brandAddr = org?.address
    ?? [data.tenant.unit.property.address, data.tenant.unit.property.city].filter(Boolean).join(", ")
    ?? "";
  const partial = data.stamp.headline.includes("PART");
  const hasDeposit = !!data.deposit;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            {logoUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={logoUrl} style={{ height: 36, marginBottom: 4, objectFit: "contain", objectPositionX: 0 }} />
            ) : (
              <Text style={styles.brandName}>{brandName}</Text>
            )}
            <Text style={styles.brandSub}>{brandAddr}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.receiptLabel}>RECEIPT</Text>
            <Text style={styles.receiptNum}>{data.receiptNumber}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={[styles.stamp, ...(partial ? [styles.stampPartial] : [])]}>
          <Text style={[styles.stampText, ...(partial ? [styles.stampTextPartial] : [])]}>{data.stamp.headline}</Text>
          <Text style={[styles.stampSub, ...(partial ? [styles.stampSubPartial] : [])]}>{data.stamp.sub}</Text>
        </View>

        <View style={styles.amountBlock}>
          <Text style={styles.amountLabel}>Amount Received</Text>
          <Text style={styles.amountValue}>{fmt(data.amount)}</Text>
        </View>

        <View style={styles.twoCol}>
          <View style={styles.col}>
            <Text style={styles.sectionLabel}>Received From</Text>
            <Text style={styles.boldText} hyphenationCallback={noHyphenation}>{data.tenant.name}</Text>
            <Text style={styles.bodyText} hyphenationCallback={noHyphenation}>{data.tenant.unit.property.name}</Text>
            <Text style={styles.bodyText}>Unit {data.tenant.unit.unitNumber}</Text>
            {data.tenant.email && <Text style={styles.bodyText}>{data.tenant.email}</Text>}
            {data.tenant.phone && <Text style={styles.bodyText}>{data.tenant.phone}</Text>}
          </View>
          <View style={styles.col}>
            <Text style={styles.sectionLabel}>Payment Details</Text>
            <View style={styles.kv}><Text style={styles.kvLabel}>Receipt No.</Text><Text style={styles.kvValue}>{data.receiptNumber}</Text></View>
            <View style={styles.kv}><Text style={styles.kvLabel}>Date received</Text><Text style={styles.kvValue}>{paidDate}</Text></View>
            {data.paymentMethod && (
              <View style={styles.kv}><Text style={styles.kvLabel}>Method</Text><Text style={styles.kvValue}>{PAYMENT_METHOD_LABEL[data.paymentMethod] ?? data.paymentMethod}</Text></View>
            )}
            {data.reference && (
              <View style={styles.kv}><Text style={styles.kvLabel}>Reference</Text><Text style={styles.kvValue} hyphenationCallback={noHyphenation}>{data.reference}</Text></View>
            )}
            {data.invoice && (
              <View style={styles.kv}><Text style={styles.kvLabel}>Invoice</Text><Text style={styles.kvValue}>{data.invoice.invoiceNumber}</Text></View>
            )}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { flex: 1 }]}>Description</Text>
            <Text style={[styles.th, { width: 120, textAlign: "right" }]}>Amount</Text>
          </View>
          {data.lines.map((l, i) => (
            <View key={`${l.label}-${i}`} style={styles.tr}>
              <Text style={styles.tdDesc} hyphenationCallback={noHyphenation}>{l.label}</Text>
              <Text style={styles.tdAmt}>{fmt(l.amount)}</Text>
            </View>
          ))}
          <View style={[styles.tr, { backgroundColor: "#f9fafb" }]}>
            <Text style={[styles.tdDesc, { fontFamily: "Helvetica-Bold" }]}>Total received</Text>
            <Text style={[styles.tdAmt, { fontFamily: "Helvetica-Bold", color: "#15803d" }]}>{fmt(data.amount)}</Text>
          </View>
        </View>

        {data.invoice && (
          <View style={styles.infoBox}>
            <Text style={styles.sectionLabel}>Invoice</Text>
            <View style={styles.row}><Text style={styles.rowLabel}>Invoice Number</Text><Text style={styles.rowValue}>{data.invoice.invoiceNumber}</Text></View>
            <View style={styles.row}><Text style={styles.rowLabel}>Billing Period</Text><Text style={styles.rowValue}>{data.invoice.periodLabel}</Text></View>
            <View style={styles.row}><Text style={styles.rowLabel}>Invoice Total</Text><Text style={styles.rowValue}>{fmt(data.invoice.totalAmount)}</Text></View>
            <View style={styles.row}><Text style={styles.rowLabel}>Paid to date</Text><Text style={[styles.rowValue, { color: "#16a34a" }]}>{fmt(data.invoice.paidToDate)}</Text></View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Balance outstanding</Text>
              <Text style={[styles.rowValue, { color: data.invoice.outstanding > 0 ? "#b45309" : "#16a34a" }]}>{fmt(data.invoice.outstanding)}</Text>
            </View>
          </View>
        )}

        {hasDeposit && data.deposit && (
          <View style={styles.infoBox}>
            <Text style={styles.sectionLabel}>Security Deposit</Text>
            <View style={styles.row}><Text style={styles.rowLabel}>Contractual deposit</Text><Text style={styles.rowValue}>{fmt(data.deposit.contractual)}</Text></View>
            <View style={styles.row}><Text style={styles.rowLabel}>Received to date</Text><Text style={[styles.rowValue, { color: "#16a34a" }]}>{fmt(data.deposit.receivedToDate)}</Text></View>
            <Text style={styles.note}>
              The security deposit is held for the duration of the tenancy and refunded on vacating, subject to the
              terms of the tenancy agreement. It is not rent and may not be applied to any month&apos;s rent.
            </Text>
          </View>
        )}

        <View style={styles.footer}>
          <View style={styles.footerDivider} />
          <Text style={styles.footerText}>
            {[brandName, data.tenant.unit.property.city].filter(Boolean).join(" · ")} · Issued {format(new Date(), "d MMM yyyy")}
            {(org?.phone || org?.email) ? `  ·  ${[org?.phone, org?.email].filter(Boolean).join(" · ")}` : ""}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generateReceiptPdf(data: ReceiptData): Promise<Buffer> {
  const element = React.createElement(ReceiptPDF, { data }) as unknown as ReactElement<DocumentProps, JSXElementConstructor<DocumentProps>>;
  return renderToBuffer(element);
}
