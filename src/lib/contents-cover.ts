/**
 * Contents-cover check: does a CONTENTS policy's sum insured cover what the
 * asset register says it would cost to replace everything at the property?
 * Pure — the API supplies the numbers.
 */

export type ContentsCoverStatus = "ok" | "under" | "no_cover_figure" | "no_assets";

export interface ContentsCoverCheck {
  status: ContentsCoverStatus;
  /** Sum of replacementValue over active (not disposed) assets with a value. */
  replacementTotal: number;
  /** Assets that carry a replacement value. */
  valuedAssets: number;
  /** replacementTotal - coverage when under-insured, else 0. */
  shortfall: number;
  /** coverage / replacementTotal, 0–1+ (undefined when either side is missing). */
  coverRatio?: number;
}

/** Cover within this fraction of the replacement total still reads as "ok" (valuations drift). */
const TOLERANCE = 0.02;

export function contentsCoverCheck(
  coverageAmount: number | null | undefined,
  replacementTotal: number,
  valuedAssets: number,
): ContentsCoverCheck {
  if (valuedAssets === 0 || replacementTotal <= 0) {
    return { status: "no_assets", replacementTotal: 0, valuedAssets: 0, shortfall: 0 };
  }
  if (!coverageAmount || coverageAmount <= 0) {
    return { status: "no_cover_figure", replacementTotal, valuedAssets, shortfall: 0 };
  }
  const coverRatio = coverageAmount / replacementTotal;
  const under = coverageAmount < replacementTotal * (1 - TOLERANCE);
  return {
    status: under ? "under" : "ok",
    replacementTotal,
    valuedAssets,
    shortfall: under ? Math.round((replacementTotal - coverageAmount) * 100) / 100 : 0,
    coverRatio,
  };
}
