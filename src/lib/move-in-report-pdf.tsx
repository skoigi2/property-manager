import "server-only";
import React from "react";
import { renderToBuffer, Document, Page, Text, View, Image, StyleSheet, DocumentProps } from "@react-pdf/renderer";
import type { JSXElementConstructor, ReactElement } from "react";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  PERFECT: { bg: "#d1fae5", fg: "#065f46" },
  GOOD:    { bg: "#dbeafe", fg: "#1e40af" },
  FAIR:    { bg: "#fef3c7", fg: "#92400e" },
  POOR:    { bg: "#fee2e2", fg: "#991b1b" },
};

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

  roomBanner: { backgroundColor: "#fef9ec", borderLeftWidth: 3, borderLeftColor: "#c9a84c", paddingHorizontal: 8, paddingVertical: 4, marginTop: 8, marginBottom: 2 },
  roomBannerText: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1a1a2e" },

  table: { marginTop: 4 },
  tableHeader: { flexDirection: "row", backgroundColor: "#f9fafb", paddingHorizontal: 6, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "#d1d5db" },
  tableRow: { flexDirection: "row", paddingHorizontal: 6, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "#f3f4f6", alignItems: "flex-start" },
  colFeature: { width: 130, fontSize: 9 },
  colStatus: { width: 70 },
  colNotes: { flex: 1, fontSize: 9, color: "#374151" },
  headerLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#6b7280", textTransform: "uppercase" },

  statusPill: { borderRadius: 99, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start" },
  statusText: { fontSize: 8, fontFamily: "Helvetica-Bold" },

  body: { fontSize: 9, color: "#374151", lineHeight: 1.4 },
  notesBox: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 2, padding: 6, marginTop: 4, minHeight: 30 },

  signatureBlock: { flexDirection: "row", gap: 24, marginTop: 24 },
  signatureCol: { flex: 1 },
  signatureLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1a1a2e", marginBottom: 18 },
  signatureLine: { borderBottomWidth: 1, borderBottomColor: "#1a1a2e", marginBottom: 2 },
  signatureSub: { fontSize: 8, color: "#6b7280", marginTop: 2 },

  footer: { position: "absolute", bottom: 24, left: 40, right: 40 },
  footerText: { fontSize: 7, color: "#9ca3af", textAlign: "center", fontStyle: "italic" },

  appendixTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#1a1a2e", marginBottom: 6 },
  photoCard: { marginBottom: 14, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 3, overflow: "hidden" },
  photoCaption: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1a1a2e", padding: 6, backgroundColor: "#f9fafb" },
  photoNote: { fontSize: 8, color: "#6b7280", paddingHorizontal: 6, paddingBottom: 4 },
});

export type ConditionReportPdfData = {
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
  unit: { unitNumber: string; type?: string };
  tenant: {
    name: string;
    phone?: string | null;
    email?: string | null;
    leaseStart?: Date | string | null;
    leaseEnd?: Date | string | null;
  } | null;
  report: {
    reportType: "MOVE_IN" | "MID_TERM" | "MOVE_OUT";
    reportDate: Date | string;
    items: ConditionPdfItem[];
    overallComments?: string | null;
    signedByTenant: boolean;
    signedByManager: boolean;
  };
  /** Resolved (signed-URL) photos, in upload order, paired with the item that owns each. */
  photos: ConditionPdfPhoto[];
};

export type ConditionPdfItem = {
  id: string;
  room: string;
  feature: string;
  status: "PERFECT" | "GOOD" | "FAIR" | "POOR" | null;
  notes?: string;
  photoIds: string[];
};

export type ConditionPdfPhoto = {
  id: string;
  url: string;
  caption: string;     // "Living Room — Walls"
  note?: string | null;
};

function StatusPill({ status }: { status: ConditionPdfItem["status"] }) {
  if (!status) {
    return (
      <View style={[styles.statusPill, { backgroundColor: "#e5e7eb" }]}>
        <Text style={[styles.statusText, { color: "#6b7280" }]}>—</Text>
      </View>
    );
  }
  const c = STATUS_COLORS[status];
  return (
    <View style={[styles.statusPill, { backgroundColor: c.bg }]}>
      <Text style={[styles.statusText, { color: c.fg }]}>{status}</Text>
    </View>
  );
}

function reportTitle(t: "MOVE_IN" | "MID_TERM" | "MOVE_OUT") {
  return t === "MOVE_IN" ? "MOVE-IN BASELINE REPORT"
    : t === "MOVE_OUT" ? "MOVE-OUT REPORT"
    : "MID-TERM INSPECTION";
}

function ReportPDF({ data }: { data: ConditionReportPdfData }) {
  const { org, property, unit, tenant, report, photos } = data;
  const reportDate = format(new Date(report.reportDate), "d MMM yyyy");

  // Group items by room (preserving order)
  const grouped: { room: string; items: ConditionPdfItem[] }[] = [];
  for (const item of report.items) {
    let g = grouped.find((x) => x.room === item.room);
    if (!g) { g = { room: item.room, items: [] }; grouped.push(g); }
    g.items.push(item);
  }

  return (
    <Document>
      {/* Page 1+: report content */}
      <Page size="A4" style={styles.page}>
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
          <Text style={styles.subTitleText}>
            {property.name.toUpperCase()} — {reportTitle(report.reportType)}
          </Text>
        </View>

        <View style={styles.twoCol}>
          <View style={styles.col}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Unit:</Text>
              <Text style={styles.fieldValue}>{unit.unitNumber}{unit.type ? ` — ${unit.type}` : ""}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Report Date:</Text>
              <Text style={styles.fieldValue}>{reportDate}</Text>
            </View>
            {property.address ? (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Property:</Text>
                <Text style={styles.fieldValue}>{property.address}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.col}>
            {tenant ? (
              <>
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Tenant:</Text>
                  <Text style={styles.fieldValue}>{tenant.name}</Text>
                </View>
                {tenant.phone && (
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>Phone:</Text>
                    <Text style={styles.fieldValue}>{tenant.phone}</Text>
                  </View>
                )}
                {tenant.leaseStart && (
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>Lease Start:</Text>
                    <Text style={styles.fieldValue}>{format(new Date(tenant.leaseStart), "d MMM yyyy")}</Text>
                  </View>
                )}
              </>
            ) : (
              <Text style={[styles.body, { fontStyle: "italic" }]}>Unit-only inspection (no tenant linked)</Text>
            )}
          </View>
        </View>

        {/* Condition table */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>Condition Summary</Text>
        </View>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.colFeature, styles.headerLabel]}>Feature</Text>
            <Text style={[styles.colStatus, styles.headerLabel]}>Status</Text>
            <Text style={[styles.colNotes, styles.headerLabel]}>Notes</Text>
          </View>

          {grouped.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={[styles.body, { fontStyle: "italic", color: "#9ca3af" }]}>No items recorded.</Text>
            </View>
          ) : (
            grouped.map((g) => (
              <View key={g.room} wrap={false}>
                <View style={styles.roomBanner}>
                  <Text style={styles.roomBannerText}>{g.room.toUpperCase()}</Text>
                </View>
                {g.items.map((item) => (
                  <View key={item.id} style={styles.tableRow}>
                    <Text style={styles.colFeature}>{item.feature}</Text>
                    <View style={styles.colStatus}>
                      <StatusPill status={item.status} />
                    </View>
                    <Text style={styles.colNotes}>{item.notes ?? ""}</Text>
                  </View>
                ))}
              </View>
            ))
          )}
        </View>

        {/* Overall comments */}
        {report.overallComments ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>Overall Comments</Text>
            </View>
            <View style={styles.notesBox}>
              <Text style={styles.body}>{report.overallComments}</Text>
            </View>
          </>
        ) : null}

        {/* Signatures */}
        <View style={styles.signatureBlock}>
          <View style={styles.signatureCol}>
            <Text style={styles.signatureLabel}>TENANT SIGNATURE:</Text>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureSub}>Signed{report.signedByTenant ? " — confirmed in system" : ""}</Text>
            <View style={[styles.signatureLine, { marginTop: 14 }]} />
            <Text style={styles.signatureSub}>Print Name</Text>
            <View style={[styles.signatureLine, { marginTop: 14 }]} />
            <Text style={styles.signatureSub}>Date</Text>
          </View>
          <View style={styles.signatureCol}>
            <Text style={styles.signatureLabel}>LANDLORD/AGENT SIGNATURE:</Text>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureSub}>Signed{report.signedByManager ? " — confirmed in system" : ""}</Text>
            <View style={[styles.signatureLine, { marginTop: 14 }]} />
            <Text style={styles.signatureSub}>Print Name</Text>
            <View style={[styles.signatureLine, { marginTop: 14 }]} />
            <Text style={styles.signatureSub}>Date</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {property.name} · Generated {format(new Date(), "d MMM yyyy")}
          </Text>
        </View>
      </Page>

      {/* Photo Appendix */}
      {photos.length > 0 ? (
        <Page size="A4" style={styles.page}>
          <Text style={styles.appendixTitle}>Photo Appendix</Text>
          <Text style={[styles.body, { marginBottom: 10 }]}>
            {photos.length} photograph{photos.length === 1 ? "" : "s"} captured during the walkthrough.
          </Text>
          {photos.map((p) => (
            <View key={p.id} style={styles.photoCard} wrap={false}>
              <Text style={styles.photoCaption}>{p.caption}</Text>
              {p.note ? <Text style={styles.photoNote}>{p.note}</Text> : null}
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={p.url} style={{ width: "100%", height: 220, objectFit: "contain" }} />
            </View>
          ))}
        </Page>
      ) : null}
    </Document>
  );
}

export async function generateConditionReportPdf(data: ConditionReportPdfData): Promise<Buffer> {
  const element = React.createElement(ReportPDF, { data }) as unknown as ReactElement<DocumentProps, JSXElementConstructor<DocumentProps>>;
  return renderToBuffer(element);
}
