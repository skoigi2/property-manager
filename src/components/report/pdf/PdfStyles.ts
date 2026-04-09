import { StyleSheet } from "@react-pdf/renderer";

// KOKA Advisory Group — colour palette
const C = {
  INK:        "#0D1A2D",
  GOLD:       "#B8902A",
  GOLD_LT:    "#F5EDD6",
  LIGHT:      "#F7F8FA",
  RULE:       "#DDE3EC",
  SLATE:      "#4A5568",
  GREEN:      "#1A7A5E",
  GREEN_BG:   "#E6F4EF",
  RED:        "#C0392B",
  RED_BG:     "#FDECEA",
  AMBER:      "#B45309",
  AMBER_BG:   "#FEF3C7",
  INDIGO:     "#3730A3",
  INDIGO_BG:  "#E0E7FF",
  MUTED_BLUE: "#8A9BB8",
  COVER_MID:  "#162036",
  WHITE:      "#FFFFFF",
} as const;

export const styles = StyleSheet.create({
  // ── Page ──────────────────────────────────────────────────────────────────
  page: {
    padding: 0,
    fontFamily: "Helvetica",
    backgroundColor: C.WHITE,
    fontSize: 10,
    color: C.INK,
  },
  pageContent: {
    paddingHorizontal: 40,
    paddingBottom: 50,
    paddingTop: 12,
  },

  // ── Cover page ────────────────────────────────────────────────────────────
  coverPage: {
    padding: 0,
    backgroundColor: C.INK,
    flexDirection: "column",
  },
  coverTopBar: {
    backgroundColor: C.GOLD,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 40,
  },
  coverTopBarLeft: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.INK,
  },
  coverTopBarRight: {
    fontSize: 9,
    color: C.INK,
  },
  coverBody: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 60,
    paddingTop: 80,
    paddingBottom: 40,
  },
  coverAccentBar: {
    width: 2,
    height: 100,
    backgroundColor: C.GOLD,
    marginRight: 24,
  },
  coverTitleBlock: {
    flexDirection: "column",
  },
  coverTitleLine: {
    fontSize: 36,
    fontFamily: "Helvetica-Bold",
    color: C.WHITE,
    lineHeight: 1.1,
  },
  coverTitleGold: {
    fontSize: 36,
    fontFamily: "Helvetica-Bold",
    color: C.GOLD,
    lineHeight: 1.1,
  },
  coverRule: {
    height: 1,
    backgroundColor: C.GOLD,
    marginHorizontal: 60,
    marginTop: 24,
    marginBottom: 20,
  },
  coverPropertyName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: C.WHITE,
    marginHorizontal: 60,
    marginBottom: 6,
  },
  coverMeta: {
    fontSize: 10,
    color: C.MUTED_BLUE,
    marginHorizontal: 60,
    marginBottom: 3,
  },
  coverFooterStrip: {
    height: 60,
    backgroundColor: C.COVER_MID,
    borderTopWidth: 1,
    borderTopColor: C.GOLD,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  coverFooterCol: {
    flex: 1,
    flexDirection: "column",
  },
  coverFooterLabel: {
    fontSize: 7,
    color: C.MUTED_BLUE,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  coverFooterValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.WHITE,
  },

  // ── Page header strip (content pages) ────────────────────────────────────
  pageHeaderStrip: {
    backgroundColor: C.INK,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 40,
  },
  pageHeaderLeft: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.WHITE,
  },
  pageHeaderRight: {
    fontSize: 8,
    color: C.GOLD,
  },

  // ── Section headings ──────────────────────────────────────────────────────
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    marginTop: 16,
  },
  sectionAccentBar: {
    width: 3,
    height: 20,
    backgroundColor: C.GOLD,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: C.INK,
  },
  sectionNumber: {
    fontSize: 10,
    color: C.GOLD,
  },

  // ── KPI cards — semantic variants ─────────────────────────────────────────
  kpiRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  // Base (unused directly, kept for any fallback)
  kpiBox: {
    flex: 1,
    borderRadius: 4,
    padding: 10,
    backgroundColor: C.LIGHT,
  },
  kpiBoxIncome: {
    flex: 1,
    backgroundColor: C.GOLD_LT,
    borderRadius: 4,
    padding: 10,
  },
  kpiBoxCost: {
    flex: 1,
    backgroundColor: C.AMBER_BG,
    borderRadius: 4,
    padding: 10,
  },
  kpiBoxProfit: {
    flex: 1,
    backgroundColor: C.GREEN_BG,
    borderRadius: 4,
    padding: 10,
  },
  kpiBoxProfitNeg: {
    flex: 1,
    backgroundColor: C.RED_BG,
    borderRadius: 4,
    padding: 10,
  },
  kpiBoxOccupancy: {
    flex: 1,
    backgroundColor: C.GOLD_LT,
    borderRadius: 4,
    padding: 10,
  },
  kpiLabel: {
    fontSize: 7,
    color: C.SLATE,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 14,
    fontFamily: "Courier-Bold",
    color: C.INK,
  },
  kpiValueCost: {
    fontSize: 14,
    fontFamily: "Courier-Bold",
    color: C.AMBER,
  },
  kpiValueProfit: {
    fontSize: 14,
    fontFamily: "Courier-Bold",
    color: C.GREEN,
  },
  kpiValueProfitNeg: {
    fontSize: 14,
    fontFamily: "Courier-Bold",
    color: C.RED,
  },

  // ── Tables ────────────────────────────────────────────────────────────────
  table: {
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: C.INK,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 0,
  },
  tableHeaderCell: {
    fontSize: 8,
    color: C.WHITE,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: C.RULE,
  },
  tableRowAlt: {
    backgroundColor: C.LIGHT,
  },
  tableRowTotal: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: C.GOLD_LT,
    borderTopWidth: 1,
    borderTopColor: C.GOLD,
    marginTop: 2,
  },
  tableCell: {
    fontSize: 9,
    color: C.INK,
  },
  tableCellMono: {
    fontSize: 9,
    fontFamily: "Courier",
    color: C.INK,
  },
  tableCellRight: {
    textAlign: "right",
  },
  tableCellBold: {
    fontFamily: "Helvetica-Bold",
  },

  // ── Status pills ──────────────────────────────────────────────────────────
  pillBase: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  pillPaid:         { backgroundColor: C.GREEN_BG },
  pillOutstanding:  { backgroundColor: C.RED_BG },
  pillTbc:          { backgroundColor: C.INDIGO_BG },
  pillExpiringSoon: { backgroundColor: C.AMBER_BG },
  pillExpired:      { backgroundColor: C.RED_BG },
  pillTextPaid:         { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.GREEN },
  pillTextOutstanding:  { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.RED },
  pillTextTbc:          { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.INDIGO },
  pillTextExpiringSoon: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.AMBER },
  pillTextExpired:      { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.RED },

  // ── P&L / Reconciliation panels ───────────────────────────────────────────
  plPanel: {
    borderLeftWidth: 3,
    borderLeftColor: C.INK,
    backgroundColor: C.LIGHT,
    marginBottom: 8,
  },
  pettyCashPanel: {
    borderLeftWidth: 3,
    borderLeftColor: C.AMBER,
    backgroundColor: C.LIGHT,
    marginBottom: 8,
  },
  mgmtFeePanel: {
    borderLeftWidth: 3,
    borderLeftColor: C.INDIGO,
    backgroundColor: C.LIGHT,
    marginBottom: 8,
  },
  plRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: C.RULE,
  },
  plRowTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: C.INK,
  },
  plRowTotalGreen: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: C.GREEN_BG,
  },
  plRowTotalAmber: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: C.AMBER_BG,
  },
  plLabel: {
    fontSize: 9,
    color: C.INK,
  },
  plLabelTotal: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.WHITE,
  },
  plLabelTotalDark: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.INK,
  },
  plValue: {
    fontSize: 9,
    fontFamily: "Courier",
    color: C.INK,
    textAlign: "right",
  },
  plValueTotal: {
    fontSize: 10,
    fontFamily: "Courier-Bold",
    color: C.GOLD,
    textAlign: "right",
  },
  plValueTotalGreen: {
    fontSize: 10,
    fontFamily: "Courier-Bold",
    color: C.GREEN,
    textAlign: "right",
  },
  plValueTotalAmber: {
    fontSize: 10,
    fontFamily: "Courier-Bold",
    color: C.AMBER,
    textAlign: "right",
  },
  plValueTotalRed: {
    fontSize: 10,
    fontFamily: "Courier-Bold",
    color: C.RED,
    textAlign: "right",
  },

  // ── Alert / action cards ──────────────────────────────────────────────────
  alertCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: C.LIGHT,
    borderRadius: 4,
    padding: 8,
    marginBottom: 6,
    borderWidth: 0.5,
    borderColor: C.RULE,
  },
  alertBadgeCritical: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: C.RED_BG,
    marginRight: 8,
    alignSelf: "flex-start",
  },
  alertBadgeHigh: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: C.AMBER_BG,
    marginRight: 8,
    alignSelf: "flex-start",
  },
  alertBadgeMedium: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: C.INDIGO_BG,
    marginRight: 8,
    alignSelf: "flex-start",
  },
  alertBadgeTextCritical: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.RED },
  alertBadgeTextHigh:     { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.AMBER },
  alertBadgeTextMedium:   { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.INDIGO },
  alertText: {
    fontSize: 9,
    color: C.INK,
    flex: 1,
  },

  // ── Utility colours ───────────────────────────────────────────────────────
  positive: { color: C.GREEN },
  negative: { color: C.RED },
  gold:     { color: C.GOLD },
  muted:    { color: C.SLATE },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: C.RULE,
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: C.RULE,
  },
});
