import "server-only";
import React from "react";
import { renderToBuffer, Document, Page, Text, View, Image, StyleSheet, DocumentProps } from "@react-pdf/renderer";
import type { JSXElementConstructor, ReactElement } from "react";
import { format } from "date-fns";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: "#1a1a2e", padding: 56 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 },
  brandBlock: { flex: 1 },
  brandName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#1a1a2e" },
  brandSub: { fontSize: 9, color: "#6b7280", marginTop: 2 },
  receiptLabel: { fontSize: 24, fontFamily: "Helvetica-Bold", color: "#16a34a", textAlign: "right" },
  receiptNum: { fontSize: 10, color: "#6b7280", textAlign: "right", marginTop: 2 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#e5e7eb", marginVertical: 14 },
  stamp: { borderWidth: 2, borderColor: "#16a34a", borderRadius: 6, padding: 12, alignSelf: "center", marginTop: 12, marginBottom: 18 },
  stampText: { color: "#16a34a", fontFamily: "Helvetica-Bold", fontSize: 16, letterSpacing: 1.5, textAlign: "center" },
  stampSub: { color: "#15803d", fontSize: 9, textAlign: "center", marginTop: 2 },
  section: { marginBottom: 18 },
  sectionLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  bodyText: { fontSize: 10, color: "#374151", lineHeight: 1.5 },
  boldText: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1a1a2e" },
  twoCol: { flexDirection: "row", gap: 24 },
  col: { flex: 1 },
  amountBlock: { backgroundColor: "#f0fdf4", borderRadius: 6, padding: 16, marginVertical: 10, alignItems: "center" },
  amountLabel: { fontSize: 9, color: "#15803d", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  amountValue: { fontSize: 22, fontFamily: "Helvetica-Bold", color: "#15803d" },
  detailsTable: { marginTop: 10 },
  row: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  rowLabel: { width: 140, color: "#6b7280", fontSize: 10 },
  rowValue: { flex: 1, color: "#1a1a2e", fontFamily: "Helvetica-Bold", fontSize: 10 },
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
  invoiceNumber: string;
  receiptNumber?: string;
  periodYear: number;
  periodMonth: number;
  totalAmount: number;
  paidAmount: number;
  paidAt: Date | string;
  paymentMethod?: string | null;
  currency?: string;
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
  const periodLabel = `${MONTH_NAMES[data.periodMonth - 1]} ${data.periodYear}`;
  const paidDate = format(new Date(data.paidAt), "d MMMM yyyy");
  const org = data.org;
  const logoUrl = data.tenant.unit.property.logoUrl ?? org?.logoUrl;
  const brandName = org?.name ?? data.tenant.unit.property.name;
  const brandAddr = org?.address
    ?? [data.tenant.unit.property.address, data.tenant.unit.property.city].filter(Boolean).join(", ")
    ?? "";
  const receiptNumber = data.receiptNumber ?? `RCPT-${data.invoiceNumber}`;

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
            <Text style={styles.receiptNum}>{receiptNumber}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.stamp}>
          <Text style={styles.stampText}>RECEIVED — PAID IN FULL</Text>
          <Text style={styles.stampSub}>Thank you for your payment</Text>
        </View>

        <View style={styles.amountBlock}>
          <Text style={styles.amountLabel}>Amount Received</Text>
          <Text style={styles.amountValue}>{fmt(data.paidAmount)}</Text>
        </View>

        <View style={styles.twoCol}>
          <View style={styles.col}>
            <Text style={styles.sectionLabel}>Received From</Text>
            <Text style={styles.boldText}>{data.tenant.name}</Text>
            <Text style={styles.bodyText}>{data.tenant.unit.property.name}</Text>
            <Text style={styles.bodyText}>Unit {data.tenant.unit.unitNumber}</Text>
            {data.tenant.email && <Text style={styles.bodyText}>{data.tenant.email}</Text>}
            {data.tenant.phone && <Text style={styles.bodyText}>{data.tenant.phone}</Text>}
          </View>
          <View style={styles.col}>
            <Text style={styles.sectionLabel}>Payment Details</Text>
          </View>
        </View>

        <View style={styles.detailsTable}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Receipt Number</Text>
            <Text style={styles.rowValue}>{receiptNumber}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Invoice Number</Text>
            <Text style={styles.rowValue}>{data.invoiceNumber}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Billing Period</Text>
            <Text style={styles.rowValue}>{periodLabel}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Payment Date</Text>
            <Text style={styles.rowValue}>{paidDate}</Text>
          </View>
          {data.paymentMethod && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Payment Method</Text>
              <Text style={styles.rowValue}>{PAYMENT_METHOD_LABEL[data.paymentMethod] ?? data.paymentMethod}</Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Invoice Total</Text>
            <Text style={styles.rowValue}>{fmt(data.totalAmount)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Amount Paid</Text>
            <Text style={[styles.rowValue, { color: "#16a34a" }]}>{fmt(data.paidAmount)}</Text>
          </View>
        </View>

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
