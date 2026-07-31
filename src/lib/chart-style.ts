/**
 * Shared Recharts text styles. SVG charts can't use Tailwind classes, so these
 * are the one sanctioned place for inline font sizes. Numeric axes rely on
 * Inter's tabular figures (fontVariantNumeric) instead of a mono face.
 */
export const CHART_FONT = {
  axisTick: { fontSize: 11, fontFamily: "var(--font-sans)", fill: "#9CA3AF" },
  numericAxisTick: {
    fontSize: 10,
    fontFamily: "var(--font-sans)",
    fontVariantNumeric: "tabular-nums",
    fill: "#9CA3AF",
  },
  tooltip: { fontFamily: "var(--font-sans)", fontSize: 12 },
  legend: { fontSize: 11, fontFamily: "var(--font-sans)" },
} as const;
