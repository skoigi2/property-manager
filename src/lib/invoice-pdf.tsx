import "server-only";
import { noHyphenation } from "@/lib/pdf-setup";
import React from "react";
import { renderToBuffer, Document, Page, Text, View, Image, StyleSheet, DocumentProps } from "@react-pdf/renderer";
import type { JSXElementConstructor, ReactElement } from "react";
import { format } from "date-fns";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: "#1a1a2e", padding: 48 },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 32 },
  brandBlock: { flex: 1 },
  brandName: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#1a1a2e", marginBottom: 2 },
  brandSub: { fontSize: 9, color: "#6b7280" },
  invoiceLabel: { fontSize: 22, fontFamily: "Helvetica-Bold", color: "#c9a84c", textAlign: "right" },
  invoiceNumber: { fontSize: 10, color: "#6b7280", textAlign: "right", marginTop: 2 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#e5e7eb", marginVertical: 16 },
  twoCol: { flexDirection: "row", gap: 24, marginBottom: 20 },
  col: { flex: 1 },
  sectionLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  bodyText: { fontSize: 10, color: "#374151", lineHeight: 1.5 },
  boldText: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1a1a2e" },
  periodBadge: { backgroundColor: "#fef9ec", borderWidth: 1, borderColor: "#f5d87a", borderRadius: 4, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start", marginBottom: 20 },
  periodText: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#c9a84c" },
  table: { marginTop: 4 },
  tableHeader: { flexDirection: "row", backgroundColor: "#f9fafb", borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 2 },
  tableRow: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  tableRowAlt: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 9, backgroundColor: "#fafafa", borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  colDesc: { flex: 1 },
  colAmt: { width: 100, textAlign: "right" },
  colAmtHeader: { width: 100, textAlign: "right" },
  headerText: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#6b7280", textTransform: "uppercase" },
  totalRow: { flexDirection: "row", backgroundColor: "#1a1a2e", borderRadius: 4, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8 },
  totalLabel: { flex: 1, color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 11 },
  totalAmt: { color: "#c9a84c", fontFamily: "Helvetica-Bold", fontSize: 13, width: 100, textAlign: "right" },
  statusBadge: { flexDirection: "row", alignItems: "center", marginTop: 20 },
  statusPaid: { backgroundColor: "#d1fae5", borderRadius: 99, paddingHorizontal: 12, paddingVertical: 4 },
  statusPaidText: { color: "#065f46", fontFamily: "Helvetica-Bold", fontSize: 9 },
  statusUnpaid: { backgroundColor: "#fef3c7", borderRadius: 99, paddingHorizontal: 12, paddingVertical: 4 },
  statusUnpaidText: { color: "#92400e", fontFamily: "Helvetica-Bold", fontSize: 9 },
  statusOverdue: { backgroundColor: "#fee2e2", borderRadius: 99, paddingHorizontal: 12, paddingVertical: 4 },
  statusOverdueText: { color: "#991b1b", fontFamily: "Helvetica-Bold", fontSize: 9 },
  statusDraft: { backgroundColor: "#f3f4f6", borderRadius: 99, paddingHorizontal: 12, paddingVertical: 4 },
  statusDraftText: { color: "#6b7280", fontFamily: "Helvetica-Bold", fontSize: 9 },
  // How to Pay section
  paySection: { marginTop: 24, borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 16 },
  paySectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  payGrid: { flexDirection: "row", gap: 16 },
  payBlock: { flex: 1, backgroundColor: "#f9fafb", borderRadius: 6, padding: 10 },
  payBlockTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#374151", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 },
  payRow: { flexDirection: "row", gap: 4, marginBottom: 2 },
  payLabel: { fontSize: 8, color: "#9ca3af", width: 80 },
  payValue: { fontSize: 8, color: "#1a1a2e", fontFamily: "Helvetica-Bold", flex: 1 },
  payInstructions: { fontSize: 8, color: "#374151", lineHeight: 1.4, marginTop: 6 },
  payContact: { marginTop: 8, fontSize: 8, color: "#6b7280" },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48 },
  footerDivider: { borderBottomWidth: 1, borderBottomColor: "#e5e7eb", marginBottom: 10 },
  footerText: { fontSize: 8, color: "#9ca3af", textAlign: "center" },
});

export type OrgBranding = {
  name: string;
  logoUrl?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  vatRegistrationNumber?: string | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  bankBranch?: string | null;
  mpesaPaybill?: string | null;
  mpesaAccountNumber?: string | null;
  mpesaTill?: string | null;
  paymentInstructions?: string | null;
};

export type InvoiceData = {
  invoiceNumber: string;
  periodYear: number;
  periodMonth: number;
  rentAmount: number;
  serviceCharge: number;
  otherCharges: number;
  lateFeeAmount?: number;
  totalAmount: number;
  dueDate: Date | string;
  status: string;
  paidAt?: Date | string | null;
  paidAmount?: number | null;
  notes?: string | null;
  currency?: string;
  org?: OrgBranding | null;
  /**
   * Invoicing identity — when the payment account belongs to a different
   * company, its name/logo/tax IDs override the header. `kraPin` falls back
   * to the legacy agreement/org value; the rest are account-only.
   */
  issuer?: {
    name?: string | null;
    logoUrl?: string | null;
    kraPin?: string | null;    // PIN No.
    vatNumber?: string | null; // VAT No.
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  /** Total of the tenant's OTHER unpaid invoices at generation time. */
  outstandingBalance?: number | null;
  tenant: {
    name: string;
    email?: string | null;
    phone?: string | null;
    poBox?: string | null;
    leaseStart?: Date | string | null;
    leaseEnd?: Date | string | null;
    paymentFrequency?: string | null;
    unit: {
      unitNumber: string;
      type?: string;
      property: {
        name: string;
        address?: string | null;
        city?: string | null;
        logoUrl?: string | null;
      };
    };
  };
};

function formatKsh(amount: number, currency = "USD") {
  const symbols: Record<string, string> = { KES: "KSh", USD: "$", GBP: "£", EUR: "€", TZS: "TSh", UGX: "USh", ZAR: "R", AED: "AED", INR: "₹", CHF: "CHF" };
  const symbol = symbols[currency] ?? currency;
  return `${symbol} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function InvoicePDF({ data }: { data: InvoiceData }) {
  const currency = data.currency ?? "USD";
  const fmt = (n: number) => formatKsh(n, currency);
  const periodLabel = `${MONTH_NAMES[data.periodMonth - 1]} ${data.periodYear}`;
  const dueDate = format(new Date(data.dueDate), "d MMMM yyyy");
  const isPaid = data.status === "PAID";
  const isOverdue = data.status === "OVERDUE";
  const isDraft = data.status === "DRAFT";

  // Advance billing note: period is in the future relative to due date
  const dueDateObj = new Date(data.dueDate);
  const periodStart = new Date(data.periodYear, data.periodMonth - 1, 1);
  const isAdvanceBilling = periodStart > dueDateObj;

  const org = data.org;
  const hasBankDetails = !!(org?.bankName || org?.bankAccountNumber);
  const hasMpesa = !!(org?.mpesaPaybill || org?.mpesaTill);
  const hasPayInstructions = !!(org?.paymentInstructions);
  const showPaySection = !isPaid && (hasBankDetails || hasMpesa || hasPayInstructions);

  // Payment terms follow the tenant's agreed cadence — the invoice still
  // covers one month, but the description must not say "Monthly" for a
  // tenant on a quarterly/biannual/annual plan.
  const frequency = data.tenant.paymentFrequency ?? null;
  const PAYMENT_TERMS: Record<string, string> = {
    MONTHLY:   "Monthly",
    QUARTERLY: "Quarterly in advance",
    BIANNUAL:  "Bi-annually in advance",
    ANNUAL:    "Annually in advance",
  };
  const paymentTerms = frequency ? PAYMENT_TERMS[frequency] ?? null : null;
  const rentLabel =
    !frequency || frequency === "MONTHLY"
      ? "Monthly Rent"
      : `Rent — ${periodLabel} (payable ${PAYMENT_TERMS[frequency]?.toLowerCase() ?? "per agreement"})`;

  const leaseStart = data.tenant.leaseStart ? format(new Date(data.tenant.leaseStart), "d MMM yyyy") : null;
  const leaseEnd   = data.tenant.leaseEnd ? format(new Date(data.tenant.leaseEnd), "d MMM yyyy") : null;
  const outstanding = data.outstandingBalance ?? 0;

  const lineItems = [
    { label: rentLabel, amount: data.rentAmount },
    ...(data.serviceCharge > 0 ? [{ label: "Service Charge", amount: data.serviceCharge }] : []),
    ...(data.otherCharges > 0 ? [{ label: "Other Charges", amount: data.otherCharges }] : []),
    ...((data.lateFeeAmount ?? 0) > 0 ? [{ label: "Late Payment Fee", amount: data.lateFeeAmount! }] : []),
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            {(() => {
              // Issuer overrides win: an invoice paid to a different company's
              // account carries that company's logo, name, and tax IDs.
              const logoUrl = data.issuer?.logoUrl ?? data.tenant.unit.property.logoUrl ?? org?.logoUrl;
              const brandName = data.issuer?.name ?? org?.name ?? data.tenant.unit.property.name;
              const brandAddr = data.issuer?.address
                ?? org?.address
                ?? [data.tenant.unit.property.address, data.tenant.unit.property.city].filter(Boolean).join(", ")
                ?? "";
              const brandContact = [data.issuer?.phone, data.issuer?.email].filter(Boolean).join("  ·  ");
              const pinNo = data.issuer?.kraPin ?? org?.vatRegistrationNumber ?? null;
              const vatNo = data.issuer?.vatNumber ?? null;
              const taxLines = (
                <>
                  {brandContact && <Text style={[styles.brandSub, { marginTop: 1 }]}>{brandContact}</Text>}
                  {pinNo && <Text style={[styles.brandSub, { marginTop: 2 }]}>PIN No: {pinNo}</Text>}
                  {vatNo && <Text style={[styles.brandSub, { marginTop: pinNo ? 1 : 2 }]}>VAT No: {vatNo}</Text>}
                </>
              );
              return logoUrl ? (
                <>
                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  <Image src={logoUrl} style={{ height: 40, marginBottom: 4, objectFit: "contain", objectPositionX: 0 }} />
                  {data.issuer?.name && <Text style={[styles.brandSub, { fontFamily: "Helvetica-Bold", color: "#1a1a2e" }]}>{data.issuer.name}</Text>}
                  <Text style={styles.brandSub}>{brandAddr}</Text>
                  {taxLines}
                </>
              ) : (
                <>
                  <Text style={styles.brandName}>{brandName}</Text>
                  <Text style={styles.brandSub}>{brandAddr}</Text>
                  {taxLines}
                </>
              );
            })()}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.invoiceLabel}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>{data.invoiceNumber}</Text>
            <View style={{ marginTop: 10, alignItems: "flex-end" }}>
              <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold", color: "#1a1a2e", textAlign: "right" }}>
                {data.tenant.unit.property.name}
              </Text>
              <Text style={{ fontSize: 9, color: "#6b7280", textAlign: "right", marginTop: 2 }}>
                Unit {data.tenant.unit.unitNumber}
                {data.tenant.unit.property.city ? `  ·  ${data.tenant.unit.property.city}` : ""}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Bill To + Invoice Details */}
        <View style={styles.twoCol}>
          <View style={styles.col}>
            <Text style={styles.sectionLabel}>Bill To</Text>
            <Text style={styles.boldText}>{data.tenant.name}</Text>
            <Text style={styles.bodyText}>{data.tenant.unit.property.name}</Text>
            <Text style={styles.bodyText}>Unit {data.tenant.unit.unitNumber}</Text>
            {data.tenant.poBox && <Text style={styles.bodyText}>{data.tenant.poBox}</Text>}
            {data.tenant.phone && <Text style={styles.bodyText}>{data.tenant.phone}</Text>}
            {data.tenant.email && <Text style={styles.bodyText}>{data.tenant.email}</Text>}
          </View>
          <View style={styles.col}>
            <Text style={styles.sectionLabel}>Invoice Details</Text>
            <Text style={styles.bodyText}>Invoice No: <Text style={styles.boldText}>{data.invoiceNumber}</Text></Text>
            <Text style={styles.bodyText}>Period: <Text style={styles.boldText}>{periodLabel}</Text></Text>
            <Text style={styles.bodyText}>Due Date: <Text style={styles.boldText}>{dueDate}</Text></Text>
            {paymentTerms && (
              <Text style={styles.bodyText}>Payment Terms: <Text style={styles.boldText}>{paymentTerms}</Text></Text>
            )}
            {(leaseStart || leaseEnd) && (
              <Text style={styles.bodyText}>
                Lease: <Text style={styles.boldText}>{leaseStart ?? "—"} to {leaseEnd ?? "open-ended"}</Text>
              </Text>
            )}
            {isPaid && data.paidAt && (
              <Text style={styles.bodyText}>Paid On: <Text style={styles.boldText}>{format(new Date(data.paidAt), "d MMM yyyy")}</Text></Text>
            )}
            {/* Status badge inline */}
            <View style={{ marginTop: 6 }}>
              {isPaid ? (
                <View style={styles.statusPaid}>
                  <Text style={styles.statusPaidText}>PAID</Text>
                </View>
              ) : isOverdue ? (
                <View style={styles.statusOverdue}>
                  <Text style={styles.statusOverdueText}>OVERDUE</Text>
                </View>
              ) : isDraft ? (
                <View style={styles.statusDraft}>
                  <Text style={styles.statusDraftText}>DRAFT</Text>
                </View>
              ) : (
                <View style={styles.statusUnpaid}>
                  <Text style={styles.statusUnpaidText}>SENT — AWAITING PAYMENT</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Period badge */}
        <View style={styles.periodBadge}>
          <Text style={styles.periodText}>
            Billing Period: {periodLabel}
            {isAdvanceBilling ? "  (Advance billing — payment due before period start)" : ""}
          </Text>
        </View>

        {/* Line items table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerText, styles.colDesc]}>Description</Text>
            <Text style={[styles.headerText, styles.colAmtHeader]}>Amount</Text>
          </View>

          {lineItems.map((item, i) => (
            <View key={item.label} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={[styles.bodyText, styles.colDesc]} hyphenationCallback={noHyphenation}>{item.label}</Text>
              <Text style={[styles.bodyText, styles.colAmt]}>{fmt(item.amount)}</Text>
            </View>
          ))}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Due</Text>
            <Text style={styles.totalAmt}>{fmt(data.totalAmount)}</Text>
          </View>

          {/* Arrears reminder — other unpaid invoices at generation time */}
          {outstanding > 0 && (
            <View style={{ backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fcd34d", borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8, marginTop: 8 }}>
              <Text style={{ fontSize: 9, color: "#92400e" }}>
                Outstanding balance from previous invoices: <Text style={{ fontFamily: "Helvetica-Bold" }}>{fmt(outstanding)}</Text>
                {"  ·  Total including this invoice: "}
                <Text style={{ fontFamily: "Helvetica-Bold" }}>{fmt(outstanding + data.totalAmount)}</Text>
              </Text>
            </View>
          )}
        </View>

        {/* Payment confirmation (if paid) */}
        {isPaid && (
          <View style={styles.statusBadge}>
            <View style={styles.statusPaid}>
              <Text style={styles.statusPaidText}>
                ✓ PAID{data.paidAmount != null ? ` — ${fmt(data.paidAmount)}` : ""}{data.paidAt ? ` on ${format(new Date(data.paidAt), "d MMM yyyy")}` : ""}
              </Text>
            </View>
          </View>
        )}

        {/* How to Pay */}
        {showPaySection && (
          <View style={styles.paySection}>
            <Text style={styles.paySectionTitle}>How to Pay</Text>
            <View style={styles.payGrid}>
              {hasBankDetails && (
                <View style={styles.payBlock}>
                  <Text style={styles.payBlockTitle}>Bank Transfer</Text>
                  {org?.bankName && (
                    <View style={styles.payRow}>
                      <Text style={styles.payLabel}>Bank:</Text>
                      <Text style={styles.payValue} hyphenationCallback={noHyphenation}>{org.bankName}</Text>
                    </View>
                  )}
                  {org?.bankAccountName && (
                    <View style={styles.payRow}>
                      <Text style={styles.payLabel}>Account Name:</Text>
                      <Text style={styles.payValue} hyphenationCallback={noHyphenation}>{org.bankAccountName}</Text>
                    </View>
                  )}
                  {org?.bankAccountNumber && (
                    <View style={styles.payRow}>
                      <Text style={styles.payLabel}>Account No:</Text>
                      <Text style={styles.payValue} hyphenationCallback={noHyphenation}>{org.bankAccountNumber}</Text>
                    </View>
                  )}
                  {org?.bankBranch && (
                    <View style={styles.payRow}>
                      <Text style={styles.payLabel}>Branch:</Text>
                      <Text style={styles.payValue} hyphenationCallback={noHyphenation}>{org.bankBranch}</Text>
                    </View>
                  )}
                </View>
              )}
              {hasMpesa && (
                <View style={styles.payBlock}>
                  <Text style={styles.payBlockTitle}>M-Pesa</Text>
                  {org?.mpesaPaybill && (
                    <View style={styles.payRow}>
                      <Text style={styles.payLabel}>Paybill:</Text>
                      <Text style={styles.payValue} hyphenationCallback={noHyphenation}>{org.mpesaPaybill}</Text>
                    </View>
                  )}
                  {org?.mpesaPaybill && org?.mpesaAccountNumber && (
                    <View style={styles.payRow}>
                      <Text style={styles.payLabel}>Account No:</Text>
                      <Text style={styles.payValue} hyphenationCallback={noHyphenation}>{org.mpesaAccountNumber}</Text>
                    </View>
                  )}
                  {org?.mpesaTill && (
                    <View style={styles.payRow}>
                      <Text style={styles.payLabel}>Till No:</Text>
                      <Text style={styles.payValue} hyphenationCallback={noHyphenation}>{org.mpesaTill}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
            {hasPayInstructions && (
              <Text style={styles.payInstructions} hyphenationCallback={noHyphenation}>{org?.paymentInstructions}</Text>
            )}
            {(data.issuer?.phone || data.issuer?.email || org?.phone || org?.email) && (
              <Text style={styles.payContact}>
                For payment queries contact: {[
                  data.issuer?.phone ?? org?.phone,
                  data.issuer?.email ?? org?.email,
                ].filter(Boolean).join("  |  ")}
              </Text>
            )}
          </View>
        )}

        {/* Notes */}
        {data.notes && (
          <View style={{ marginTop: 16 }}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={styles.bodyText} hyphenationCallback={noHyphenation}>{data.notes}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerDivider} />
          <Text style={styles.footerText}>
            {[data.tenant.unit.property.name, data.tenant.unit.property.city].filter(Boolean).join(" · ")} · Generated {format(new Date(), "d MMM yyyy")}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generateInvoicePdf(data: InvoiceData): Promise<Buffer> {
  const element = React.createElement(InvoicePDF, { data }) as unknown as ReactElement<DocumentProps, JSXElementConstructor<DocumentProps>>;
  return renderToBuffer(element);
}
