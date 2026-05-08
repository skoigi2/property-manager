import "server-only";
import React from "react";
import { renderToBuffer, Document, Page, Text, View, Image, StyleSheet, DocumentProps } from "@react-pdf/renderer";
import type { JSXElementConstructor, ReactElement } from "react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/currency";

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: "#1a1a2e", padding: 40 },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14, alignItems: "flex-end" },
  brandBlock: { flex: 1 },
  brandName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#1a1a2e" },
  brandSub: { fontSize: 9, color: "#6b7280", marginTop: 2 },
  titleBox: { backgroundColor: "#1a1a2e", paddingVertical: 8, paddingHorizontal: 12, marginBottom: 16, borderRadius: 3 },
  titleText: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 12, textAlign: "center", letterSpacing: 0.5 },
  subTitleText: { color: "#c9a84c", fontFamily: "Helvetica-Bold", fontSize: 10, textAlign: "center", marginTop: 2 },
  twoCol: { flexDirection: "row", gap: 16, marginBottom: 12 },
  col: { flex: 1 },
  fieldRow: { flexDirection: "row", marginBottom: 4 },
  fieldLabel: { fontSize: 9, color: "#374151", fontFamily: "Helvetica-Bold", width: 110 },
  fieldValue: { fontSize: 9, color: "#1a1a2e", flex: 1 },
  sectionHeader: { backgroundColor: "#f3f4f6", paddingHorizontal: 8, paddingVertical: 5, marginTop: 10, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: "#c9a84c" },
  sectionHeaderText: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1a1a2e", textTransform: "uppercase", letterSpacing: 0.5 },
  checkboxRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  checkbox: { width: 9, height: 9, borderWidth: 1, borderColor: "#1a1a2e", marginRight: 5, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: "#1a1a2e" },
  checkboxTick: { color: "#ffffff", fontSize: 7, fontFamily: "Helvetica-Bold", lineHeight: 1 },
  checkboxLabel: { fontSize: 9, color: "#1a1a2e" },
  body: { fontSize: 9, color: "#374151", lineHeight: 1.4 },
  notesBox: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 2, padding: 6, marginTop: 4, minHeight: 30 },
  table: { marginTop: 4 },
  tableHeader: { flexDirection: "row", backgroundColor: "#f9fafb", paddingHorizontal: 6, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "#d1d5db" },
  tableRow: { flexDirection: "row", paddingHorizontal: 6, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  colDesc: { flex: 1, fontSize: 9 },
  colAmt: { width: 90, textAlign: "right", fontSize: 9 },
  totalRow: { flexDirection: "row", paddingHorizontal: 6, paddingVertical: 6, backgroundColor: "#fef9ec", borderTopWidth: 1, borderTopColor: "#f5d87a" },
  totalLabel: { flex: 1, fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1a1a2e" },
  totalAmt: { width: 90, textAlign: "right", fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1a1a2e" },
  settlementRow: { flexDirection: "row", paddingHorizontal: 6, paddingVertical: 4 },
  settlementLabel: { flex: 1, fontSize: 9, color: "#374151" },
  settlementAmt: { width: 90, textAlign: "right", fontSize: 9 },
  refundRow: { flexDirection: "row", paddingHorizontal: 6, paddingVertical: 7, backgroundColor: "#d1fae5", marginTop: 3, borderRadius: 2 },
  refundLabel: { flex: 1, fontSize: 11, fontFamily: "Helvetica-Bold", color: "#065f46" },
  refundAmt: { width: 100, textAlign: "right", fontSize: 12, fontFamily: "Helvetica-Bold", color: "#065f46" },
  refundOwed: { backgroundColor: "#fee2e2" },
  refundOwedLabel: { color: "#991b1b" },
  refundOwedAmt: { color: "#991b1b" },
  signatureBlock: { flexDirection: "row", gap: 24, marginTop: 24 },
  signatureCol: { flex: 1 },
  signatureLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1a1a2e", marginBottom: 18 },
  signatureLine: { borderBottomWidth: 1, borderBottomColor: "#1a1a2e", marginBottom: 2 },
  signatureSub: { fontSize: 8, color: "#6b7280", marginTop: 2 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40 },
  footerText: { fontSize: 7, color: "#9ca3af", textAlign: "center", fontStyle: "italic" },
});

export type CheckoutPdfData = {
  org: {
    name: string;
    logoUrl?: string | null;
    address?: string | null;
  };
  property: {
    name: string;
    address?: string | null;
    currency: string;
  };
  tenant: {
    name: string;
    phone?: string | null;
    leaseStart: Date | string;
    leaseEnd?: Date | string | null;
    monthlyRent: number;
    depositAmount: number;
  };
  unit: { unitNumber: string };
  checkout: {
    checkOutDate: Date | string;
    damageFound: boolean;
    inventoryDamageAmount: number;
    inventoryDamageNotes?: string | null;
    rentBalanceOwing: number;
    deductions: { description: string; amount: number }[];
    totalDeductions: number;
    balanceToRefund: number;
    keysReturned?: { mainDoor?: number; bedroom?: number; gate?: number; mailbox?: number } | null;
    utilityTransfers?: {
      electricity?: { done?: boolean; date?: string | null };
      water?: { done?: boolean; date?: string | null };
      internet?: { done?: boolean; date?: string | null };
    } | null;
    refundMethod?: "CHEQUE" | "CASH" | "MOBILE_TRANSFER" | "BANK_TRANSFER" | null;
    refundDetails?: {
      payableTo?: string;
      recipientName?: string;
      mobileNumber?: string;
      accountNumber?: string;
      bankName?: string;
      accountName?: string;
    } | null;
    notes?: string | null;
  };
};

function Checkbox({ checked, label }: { checked: boolean; label: string }) {
  return (
    <View style={styles.checkboxRow}>
      <View style={[styles.checkbox, checked ? styles.checkboxChecked : {}]}>
        {checked ? <Text style={styles.checkboxTick}>X</Text> : null}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </View>
  );
}

function CheckoutPDF({ data }: { data: CheckoutPdfData }) {
  const { tenant, unit, property, org, checkout } = data;
  const fmt = (n: number) => formatCurrency(n, property.currency);
  const checkOutDate = format(new Date(checkout.checkOutDate), "d MMM yyyy");
  const leaseStart = format(new Date(tenant.leaseStart), "d MMM yyyy");
  const leaseEnd = tenant.leaseEnd ? format(new Date(tenant.leaseEnd), "d MMM yyyy") : "—";
  const isOwed = checkout.balanceToRefund < 0;
  const balanceAbs = Math.abs(checkout.balanceToRefund);

  const inventoryDamage = checkout.damageFound ? checkout.inventoryDamageAmount : 0;
  const utilities = checkout.utilityTransfers ?? {};
  const keys = checkout.keysReturned ?? {};

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header / branding */}
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            {org.logoUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={org.logoUrl} style={{ height: 32, marginBottom: 4, objectFit: "contain", objectPositionX: 0 }} />
            ) : (
              <Text style={styles.brandName}>{org.name}</Text>
            )}
            {org.address ? <Text style={styles.brandSub}>{org.address}</Text> : null}
          </View>
        </View>

        <View style={styles.titleBox}>
          <Text style={styles.titleText}>{org.name.toUpperCase()}</Text>
          <Text style={styles.subTitleText}>{property.name.toUpperCase()} — TENANT CHECK-OUT FORM</Text>
        </View>

        {/* Header fields (two col) */}
        <View style={styles.twoCol}>
          <View style={styles.col}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Tenant&apos;s Name:</Text>
              <Text style={styles.fieldValue}>{tenant.name}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Date of Check In:</Text>
              <Text style={styles.fieldValue}>{leaseStart}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Lease Start Date:</Text>
              <Text style={styles.fieldValue}>{leaseStart}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Monthly Rent:</Text>
              <Text style={styles.fieldValue}>{fmt(tenant.monthlyRent)}</Text>
            </View>
          </View>
          <View style={styles.col}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Apartment/Unit No:</Text>
              <Text style={styles.fieldValue}>{unit.unitNumber}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Date of Check Out:</Text>
              <Text style={styles.fieldValue}>{checkOutDate}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Lease End Date:</Text>
              <Text style={styles.fieldValue}>{leaseEnd}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Phone Number:</Text>
              <Text style={styles.fieldValue}>{tenant.phone ?? "—"}</Text>
            </View>
          </View>
        </View>

        {/* 1. Inventory & Property Condition */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>1. Inventory &amp; Property Condition</Text>
        </View>
        <Text style={styles.body}>Was there any damage/breakage to the inventory?</Text>
        <View style={{ flexDirection: "row", gap: 24, marginTop: 4 }}>
          <Checkbox checked={checkout.damageFound} label="Yes" />
          <Checkbox checked={!checkout.damageFound} label="No" />
          <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 12 }}>
            <Text style={[styles.checkboxLabel, { marginRight: 6 }]}>Amount Charged:</Text>
            <Text style={[styles.checkboxLabel, { fontFamily: "Helvetica-Bold" }]}>{fmt(inventoryDamage)}</Text>
          </View>
        </View>
        <Text style={[styles.body, { marginTop: 6, fontStyle: "italic" }]}>Description of damages:</Text>
        <View style={styles.notesBox}>
          <Text style={styles.body}>{checkout.inventoryDamageNotes || ""}</Text>
        </View>

        {/* 2. Rent Balance Status */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>2. Rent Balance Status</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 24 }}>
          <Checkbox checked={checkout.rentBalanceOwing === 0} label="Cleared" />
          <Checkbox checked={checkout.rentBalanceOwing > 0} label="Uncleared" />
        </View>
        <View style={[styles.fieldRow, { marginTop: 4 }]}>
          <Text style={styles.fieldLabel}>Balance Owing:</Text>
          <Text style={styles.fieldValue}>{fmt(checkout.rentBalanceOwing)}</Text>
        </View>

        {/* 3. Deductions table */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>3. Utility Bills &amp; Other Deductions</Text>
        </View>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.colDesc, { fontFamily: "Helvetica-Bold" }]}>Description</Text>
            <Text style={[styles.colAmt, { fontFamily: "Helvetica-Bold" }]}>Amount</Text>
          </View>
          {checkout.deductions.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={[styles.colDesc, { color: "#9ca3af", fontStyle: "italic" }]}>No deductions</Text>
              <Text style={styles.colAmt}>—</Text>
            </View>
          ) : (
            checkout.deductions.map((d, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={styles.colDesc}>{d.description}</Text>
                <Text style={styles.colAmt}>{fmt(d.amount)}</Text>
              </View>
            ))
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL DEDUCTIONS</Text>
            <Text style={styles.totalAmt}>{fmt(checkout.totalDeductions)}</Text>
          </View>
        </View>

        {/* 4. Rent Deposit Held */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>4. Rent Deposit Held</Text>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Original Deposit:</Text>
          <Text style={[styles.fieldValue, { fontFamily: "Helvetica-Bold" }]}>{fmt(tenant.depositAmount)}</Text>
        </View>

        {/* 5. Final Settlement */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>5. Final Settlement</Text>
        </View>
        <View style={styles.settlementRow}>
          <Text style={styles.settlementLabel}>Rent Deposit:</Text>
          <Text style={styles.settlementAmt}>{fmt(tenant.depositAmount)}</Text>
        </View>
        <View style={styles.settlementRow}>
          <Text style={styles.settlementLabel}>Less: Inventory Damage (Item 1):</Text>
          <Text style={styles.settlementAmt}>−{fmt(inventoryDamage)}</Text>
        </View>
        <View style={styles.settlementRow}>
          <Text style={styles.settlementLabel}>Less: Rent Balance (Item 2):</Text>
          <Text style={styles.settlementAmt}>−{fmt(checkout.rentBalanceOwing)}</Text>
        </View>
        <View style={styles.settlementRow}>
          <Text style={styles.settlementLabel}>Less: Total Deductions (Item 3):</Text>
          <Text style={styles.settlementAmt}>−{fmt(checkout.totalDeductions)}</Text>
        </View>
        <View style={[styles.refundRow, isOwed ? styles.refundOwed : {}]}>
          <Text style={[styles.refundLabel, isOwed ? styles.refundOwedLabel : {}]}>
            {isOwed ? "BALANCE OWED BY TENANT" : "BALANCE TO REFUND"}
          </Text>
          <Text style={[styles.refundAmt, isOwed ? styles.refundOwedAmt : {}]}>{fmt(balanceAbs)}</Text>
        </View>

        {/* 6. Keys Returned */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>6. Keys Returned</Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
          <Checkbox checked={(keys.mainDoor ?? 0) > 0} label={`Main Door Key(s) — Qty: ${keys.mainDoor ?? 0}`} />
          <Checkbox checked={(keys.bedroom ?? 0) > 0} label={`Bedroom Key(s) — Qty: ${keys.bedroom ?? 0}`} />
          <Checkbox checked={(keys.gate ?? 0) > 0} label={`Gate/Common Area — Qty: ${keys.gate ?? 0}`} />
          <Checkbox checked={(keys.mailbox ?? 0) > 0} label={`Mailbox Key — Qty: ${keys.mailbox ?? 0}`} />
        </View>

        {/* 7. Utility Account Transfer */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>7. Utility Account Transfer</Text>
        </View>
        {(["electricity", "water", "internet"] as const).map((k) => {
          const u = utilities[k];
          const labelMap: Record<string, string> = {
            electricity: "Electricity account transferred",
            water:       "Water account transferred",
            internet:    "Internet disconnected",
          };
          const dateText = u?.date ? format(new Date(u.date), "d MMM yyyy") : "—";
          return (
            <View key={k} style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
              <Checkbox checked={!!u?.done} label={labelMap[k]} />
              <Text style={[styles.checkboxLabel, { marginLeft: 12 }]}>Date: {dateText}</Text>
            </View>
          );
        })}

        {/* 8. Refund Instructions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>8. Instructions for Refund of Deposit</Text>
        </View>
        <Text style={styles.body}>Kindly refund the balance of my rent deposit through:</Text>
        <View style={{ flexDirection: "row", gap: 16, marginTop: 4, flexWrap: "wrap" }}>
          <Checkbox checked={checkout.refundMethod === "CHEQUE"} label="Cheque" />
          <Checkbox checked={checkout.refundMethod === "CASH"} label="Cash" />
          <Checkbox checked={checkout.refundMethod === "MOBILE_TRANSFER"} label="Mobile Transfer (M-Pesa/Airtel)" />
          <Checkbox checked={checkout.refundMethod === "BANK_TRANSFER"} label="Bank Transfer" />
        </View>
        <View style={{ marginTop: 6 }}>
          {checkout.refundMethod === "CHEQUE" && checkout.refundDetails?.payableTo ? (
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Payable to:</Text>
              <Text style={styles.fieldValue}>{checkout.refundDetails.payableTo}</Text>
            </View>
          ) : null}
          {checkout.refundMethod === "CASH" && checkout.refundDetails?.recipientName ? (
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Recipient Name:</Text>
              <Text style={styles.fieldValue}>{checkout.refundDetails.recipientName}</Text>
            </View>
          ) : null}
          {checkout.refundMethod === "MOBILE_TRANSFER" && checkout.refundDetails?.mobileNumber ? (
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Mobile No:</Text>
              <Text style={styles.fieldValue}>{checkout.refundDetails.mobileNumber}</Text>
            </View>
          ) : null}
          {checkout.refundMethod === "BANK_TRANSFER" ? (
            <>
              {checkout.refundDetails?.accountNumber ? (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Account No:</Text>
                  <Text style={styles.fieldValue}>{checkout.refundDetails.accountNumber}</Text>
                </View>
              ) : null}
              {checkout.refundDetails?.bankName ? (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Bank Name:</Text>
                  <Text style={styles.fieldValue}>{checkout.refundDetails.bankName}</Text>
                </View>
              ) : null}
              {checkout.refundDetails?.accountName ? (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Account Name:</Text>
                  <Text style={styles.fieldValue}>{checkout.refundDetails.accountName}</Text>
                </View>
              ) : null}
            </>
          ) : null}
        </View>

        {/* 9. Additional Notes */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>9. Additional Notes / Comments</Text>
        </View>
        <View style={styles.notesBox}>
          <Text style={styles.body}>{checkout.notes || ""}</Text>
        </View>

        {/* Signatures */}
        <View style={styles.signatureBlock}>
          <View style={styles.signatureCol}>
            <Text style={styles.signatureLabel}>TENANT SIGNATURE:</Text>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureSub}>Signed</Text>
            <View style={[styles.signatureLine, { marginTop: 14 }]} />
            <Text style={styles.signatureSub}>Print Name</Text>
            <View style={[styles.signatureLine, { marginTop: 14 }]} />
            <Text style={styles.signatureSub}>Date</Text>
          </View>
          <View style={styles.signatureCol}>
            <Text style={styles.signatureLabel}>LANDLORD/AGENT SIGNATURE:</Text>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureSub}>Signed</Text>
            <View style={[styles.signatureLine, { marginTop: 14 }]} />
            <Text style={styles.signatureSub}>Print Name</Text>
            <View style={[styles.signatureLine, { marginTop: 14 }]} />
            <Text style={styles.signatureSub}>Date</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Note: This form must be completed and signed by both parties. Tenant to receive a copy upon completion.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generateCheckoutPdf(data: CheckoutPdfData): Promise<Buffer> {
  const element = React.createElement(CheckoutPDF, { data }) as unknown as ReactElement<DocumentProps, JSXElementConstructor<DocumentProps>>;
  return renderToBuffer(element);
}
