import { StyleSheet } from "@react-pdf/renderer";

export const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    backgroundColor: "#FFFFFF",
    fontSize: 10,
    color: "#1A1A2E",
  },
  // Cover
  coverPage: {
    padding: 60,
    backgroundColor: "#1A1A2E",
    minHeight: "100%",
    justifyContent: "center",
  },
  coverTitle: {
    fontSize: 32,
    color: "#FFFFFF",
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
  },
  coverSub: {
    fontSize: 14,
    color: "#C9A84C",
    marginBottom: 40,
  },
  coverMeta: {
    fontSize: 11,
    color: "#FFFFFF",
    opacity: 0.7,
    marginBottom: 4,
  },
  confidential: {
    fontSize: 9,
    color: "#C9A84C",
    letterSpacing: 2,
    marginTop: 60,
  },
  // Section headers
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#1A1A2E",
    borderBottomWidth: 2,
    borderBottomColor: "#C9A84C",
    paddingBottom: 4,
    marginBottom: 12,
    marginTop: 16,
  },
  sectionNumber: {
    fontSize: 10,
    color: "#C9A84C",
    marginRight: 6,
  },
  // KPI boxes
  kpiRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  kpiBox: {
    flex: 1,
    backgroundColor: "#FAF7F2",
    borderRadius: 6,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#C9A84C",
  },
  kpiLabel: {
    fontSize: 8,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 14,
    fontFamily: "Courier-Bold",
    color: "#1A1A2E",
  },
  // Tables
  table: {
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#1A1A2E",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginBottom: 2,
  },
  tableHeaderCell: {
    fontSize: 8,
    color: "#FFFFFF",
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  tableRowAlt: {
    backgroundColor: "#FAFAFA",
  },
  tableRowTotal: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: "#F0EBE1",
    borderTopWidth: 1,
    borderTopColor: "#C9A84C",
    marginTop: 2,
  },
  tableCell: {
    fontSize: 9,
    color: "#374151",
  },
  tableCellMono: {
    fontSize: 9,
    fontFamily: "Courier",
    color: "#374151",
  },
  tableCellRight: {
    textAlign: "right",
  },
  tableCellBold: {
    fontFamily: "Helvetica-Bold",
  },
  // Colors
  positive: { color: "#16A34A" },
  negative: { color: "#DC2626" },
  gold: { color: "#C9A84C" },
  muted: { color: "#6B7280" },
  // PL
  plRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  plRowTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 7,
    paddingHorizontal: 8,
    backgroundColor: "#1A1A2E",
    borderRadius: 4,
    marginTop: 4,
  },
  plLabel: {
    fontSize: 9,
    color: "#374151",
  },
  plLabelTotal: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#FFFFFF",
  },
  plValue: {
    fontSize: 9,
    fontFamily: "Courier",
    color: "#374151",
    textAlign: "right",
  },
  plValueTotal: {
    fontSize: 10,
    fontFamily: "Courier-Bold",
    color: "#C9A84C",
    textAlign: "right",
  },
  // Alerts
  alertBox: {
    backgroundColor: "#FEF2F2",
    borderRadius: 4,
    padding: 8,
    marginBottom: 4,
    borderLeftWidth: 3,
    borderLeftColor: "#DC2626",
  },
  alertText: {
    fontSize: 9,
    color: "#DC2626",
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 8,
  },
  footerText: {
    fontSize: 8,
    color: "#9CA3AF",
  },
});
