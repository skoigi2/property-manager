import "server-only";
import React from "react";
import { renderToBuffer, Document, Page, Text, View, StyleSheet, DocumentProps } from "@react-pdf/renderer";
import type { JSXElementConstructor, ReactElement } from "react";
import { format } from "date-fns";
import type { OwnerInvoiceLineItem } from "@/lib/validations";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const OWNER_INVOICE_TYPE_LABELS: Record<string, string> = {
  LETTING_FEE:          "Letting Fee Invoice",
  PERIODIC_LETTING_FEE: "Airbnb Periodic Letting Fee Invoice",
  RENEWAL_FEE:          "Lease Renewal Fee Invoice",
  MANAGEMENT_FEE:       "Management Fee Invoice",
  VACANCY_FEE:          "Vacancy Fee Invoice",
  SETUP_FEE_INSTALMENT: "Setup Fee Invoice",
  CONSULTANCY_FEE:      "Consultancy Fee Invoice",
};

const styles = StyleSheet.create({
  page:            { fontFamily: "Helvetica", fontSize: 10, color: "#1a1a2e", padding: 48 },
  header:          { flexDirection: "row", justifyContent: "space-between", marginBottom: 32 },
  brandBlock:      { flex: 1 },
  brandName:       { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#1a1a2e", marginBottom: 2 },
  brandSub:        { fontSize: 9, color: "#6b7280" },
  invoiceLabel:    { fontSize: 22, fontFamily: "Helvetica-Bold", color: "#c9a84c", textAlign: "right" },
  invoiceType:     { fontSize: 9, color: "#6b7280", textAlign: "right", marginTop: 2 },
  invoiceNumber:   { fontSize: 10, color: "#6b7280", textAlign: "right", marginTop: 2 },
  divider:         { borderBottomWidth: 1, borderBottomColor: "#e5e7eb", marginVertical: 16 },
  twoCol:          { flexDirection: "row", gap: 24, marginBottom: 20 },
  col:             { flex: 1 },
  sectionLabel:    { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  bodyText:        { fontSize: 10, color: "#374151", lineHeight: 1.5 },
  boldText:        { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1a1a2e" },
  periodBadge:     { backgroundColor: "#fef9ec", borderWidth: 1, borderColor: "#f5d87a", borderRadius: 4, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start", marginBottom: 20 },
  periodText:      { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#c9a84c" },
  table:           { marginTop: 4 },
  tableHeader:     { flexDirection: "row", backgroundColor: "#f9fafb", borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 2 },
  tableRow:        { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  tableRowAlt:     { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 9, backgroundColor: "#fafafa", borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  colDesc:         { flex: 1 },
  colAmt:          { width: 110, textAlign: "right" },
  colAmtHeader:    { width: 110, textAlign: "right" },
  headerText:      { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#6b7280", textTransform: "uppercase" },
  totalRow:        { flexDirection: "row", backgroundColor: "#1a1a2e", borderRadius: 4, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8 },
  totalLabel:      { flex: 1, color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 11 },
  totalAmt:        { color: "#c9a84c", fontFamily: "Helvetica-Bold", fontSize: 13, width: 110, textAlign: "right" },
  statusBadge:     { flexDirection: "row", alignItems: "center", marginTop: 20 },
  statusPaid:      { backgroundColor: "#d1fae5", borderRadius: 99, paddingHorizontal: 12, paddingVertical: 4 },
  statusPaidText:  { color: "#065f46", fontFamily: "Helvetica-Bold", fontSize: 9 },
  statusUnpaid:    { backgroundColor: "#fef3c7", borderRadius: 99, paddingHorizontal: 12, paddingVertical: 4 },
  statusUnpaidText:{ color: "#92400e", fontFamily: "Helvetica-Bold", fontSize: 9 },
  breakdownNote:   { fontSize: 8, color: "#9ca3af", marginTop: 12, textAlign: "right" },
  breakdownHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  breakdownTitle:  { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#1a1a2e", marginBottom: 2 },
  breakdownSub:    { fontSize: 9, color: "#6b7280" },
  footer:          { position: "absolute", bottom: 32, left: 48, right: 48 },
  footerDivider:   { borderBottomWidth: 1, borderBottomColor: "#e5e7eb", marginBottom: 10 },
  footerText:      { fontSize: 8, color: "#9ca3af", textAlign: "center" },
});

export type OwnerInvoiceData = {
  id: string;
  invoiceNumber: string;
  type: string;
  periodYear: number;
  periodMonth: number;
  lineItems: OwnerInvoiceLineItem[];
  totalAmount: number;
  dueDate: Date | string;
  status: string;
  paidAt?: Date | string | null;
  paidAmount?: number | null;
  notes?: string | null;
  property: {
    name: string;
    address?: string | null;
    city?: string | null;
  };
  owner?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
};

function formatKsh(amount: number) {
  return `KSh ${amount.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function LineItemsTable({ items }: { items: OwnerInvoiceLineItem[] }) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHeader}>
        <Text style={[styles.headerText, styles.colDesc]}>Description</Text>
        <Text style={[styles.headerText, styles.colAmtHeader]}>Amount</Text>
      </View>
      {items.map((item, i) => (
        <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
          <Text style={[styles.bodyText, styles.colDesc]}>{item.description}</Text>
          <Text style={[styles.bodyText, styles.colAmt]}>{formatKsh(item.amount)}</Text>
        </View>
      ))}
    </View>
  );
}

function OwnerInvoicePDF({ data }: { data: OwnerInvoiceData }) {
  const periodLabel = `${MONTH_NAMES[data.periodMonth - 1]} ${data.periodYear}`;
  const dueDate  = format(new Date(data.dueDate), "d MMMM yyyy");
  const isPaid   = data.status === "PAID";
  const typeLabel = OWNER_INVOICE_TYPE_LABELS[data.type] ?? "Owner Invoice";

  // Show two pages for MANAGEMENT_FEE invoices that have a per-unit breakdown
  const showBreakdown = data.type === "MANAGEMENT_FEE" && data.lineItems.length > 1;

  // Page 1 shows a single summary line; page 2 shows the detail
  const summaryItems: OwnerInvoiceLineItem[] = showBreakdown
    ? [{ description: `Management Fee — ${periodLabel}`, amount: data.totalAmount, unitId: null, tenantId: null, incomeType: "OTHER" }]
    : data.lineItems;

  const generatedOn = format(new Date(), "d MMM yyyy");

  return (
    <Document>
      {/* ── Page 1: Summary ─────────────────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <Text style={styles.brandName}>PKH Property Management</Text>
            <Text style={styles.brandSub}>Nairobi, Kenya</Text>
          </View>
          <View>
            <Text style={styles.invoiceLabel}>OWNER INVOICE</Text>
            <Text style={styles.invoiceType}>{typeLabel}</Text>
            <Text style={styles.invoiceNumber}>{data.invoiceNumber}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Bill To + Invoice Details */}
        <View style={styles.twoCol}>
          <View style={styles.col}>
            <Text style={styles.sectionLabel}>Bill To (Property Owner)</Text>
            {data.owner?.name  ? <Text style={styles.boldText}>{data.owner.name}</Text>  : <Text style={styles.bodyText}>—</Text>}
            {data.owner?.phone && <Text style={styles.bodyText}>{data.owner.phone}</Text>}
            {data.owner?.email && <Text style={styles.bodyText}>{data.owner.email}</Text>}
          </View>
          <View style={styles.col}>
            <Text style={styles.sectionLabel}>Invoice Details</Text>
            <Text style={styles.bodyText}>Property: <Text style={styles.boldText}>{data.property.name}</Text></Text>
            <Text style={styles.bodyText}>Invoice No: <Text style={styles.boldText}>{data.invoiceNumber}</Text></Text>
            <Text style={styles.bodyText}>Due Date: <Text style={styles.boldText}>{dueDate}</Text></Text>
            {isPaid && data.paidAt && (
              <Text style={styles.bodyText}>Paid On: <Text style={styles.boldText}>{format(new Date(data.paidAt), "d MMM yyyy")}</Text></Text>
            )}
          </View>
        </View>

        {/* Period badge */}
        <View style={styles.periodBadge}>
          <Text style={styles.periodText}>Period: {periodLabel}</Text>
        </View>

        {/* Line items (summary or full) */}
        <LineItemsTable items={summaryItems} />

        {/* Total */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total Due</Text>
          <Text style={styles.totalAmt}>{formatKsh(data.totalAmount)}</Text>
        </View>

        {/* Breakdown note */}
        {showBreakdown && (
          <Text style={styles.breakdownNote}>See page 2 for per-unit fee breakdown</Text>
        )}

        {/* Payment status */}
        <View style={styles.statusBadge}>
          {isPaid ? (
            <View style={styles.statusPaid}>
              <Text style={styles.statusPaidText}>
                PAID — {data.paidAmount ? formatKsh(data.paidAmount) : formatKsh(data.totalAmount)}
              </Text>
            </View>
          ) : (
            <View style={styles.statusUnpaid}>
              <Text style={styles.statusUnpaidText}>PAYMENT DUE BY {dueDate.toUpperCase()}</Text>
            </View>
          )}
        </View>

        {/* Notes */}
        {data.notes && (
          <View style={{ marginTop: 20 }}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={styles.bodyText}>{data.notes}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerDivider} />
          <Text style={styles.footerText}>
            PKH Property Management · {data.property.name} · Generated {generatedOn}
          </Text>
        </View>
      </Page>

      {/* ── Page 2: Per-unit Breakdown (MANAGEMENT_FEE only) ────────────────── */}
      {showBreakdown && (
        <Page size="A4" style={styles.page}>
          <View style={styles.breakdownHeader}>
            <View>
              <Text style={styles.breakdownTitle}>Fee Breakdown by Unit</Text>
              <Text style={styles.breakdownSub}>{data.property.name} · {periodLabel} · {data.invoiceNumber}</Text>
            </View>
            <View style={styles.periodBadge}>
              <Text style={styles.periodText}>Period: {periodLabel}</Text>
            </View>
          </View>

          <LineItemsTable items={data.lineItems} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Management Fee</Text>
            <Text style={styles.totalAmt}>{formatKsh(data.totalAmount)}</Text>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.footerDivider} />
            <Text style={styles.footerText}>
              PKH Property Management · {data.property.name} · Generated {generatedOn} · Page 2
            </Text>
          </View>
        </Page>
      )}
    </Document>
  );
}

export async function generateOwnerInvoicePdf(data: OwnerInvoiceData): Promise<Buffer> {
  const element = React.createElement(OwnerInvoicePDF, { data }) as unknown as ReactElement<DocumentProps, JSXElementConstructor<DocumentProps>>;
  return renderToBuffer(element);
}
