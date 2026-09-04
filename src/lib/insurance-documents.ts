/**
 * Insurance policy documents — pure helpers shared by the API routes, the
 * upload component and the policy card. No Prisma, no React.
 * File rules (allowed types, storage paths, legacy URLs) are shared with the
 * asset register in src/lib/document-files.ts.
 */
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_MAX_MB,
  categoryLabelMap,
  documentStoragePath,
  isAllowedDocumentFile,
  sortDocumentsByCategory,
  type DocumentCategoryDef,
} from "@/lib/document-files";

export { isLegacyPublicUrl } from "@/lib/document-files";

export const INSURANCE_DOCUMENT_CATEGORIES: readonly DocumentCategoryDef[] = [
  { value: "POLICY_SCHEDULE",    label: "Policy schedule",    hint: "The policy wording / schedule from the insurer" },
  { value: "CERTIFICATE",        label: "Certificate",        hint: "Certificate of insurance or cover note" },
  { value: "VALUATION_REPORT",   label: "Valuation report",   hint: "Independent valuation the sum insured is based on" },
  { value: "INSURER_ASSESSMENT", label: "Insurer assessment", hint: "Survey / risk assessment carried out by the insurer" },
  { value: "CLAIM",              label: "Claim",              hint: "Claim forms, correspondence, settlement letters" },
  { value: "INVOICE_RECEIPT",    label: "Invoice / receipt",  hint: "Premium invoice or proof of payment" },
  { value: "OTHER",              label: "Other",              hint: "Anything else related to this policy" },
];

export const INSURANCE_DOCUMENT_CATEGORY_LABEL = categoryLabelMap(INSURANCE_DOCUMENT_CATEGORIES);

export function isInsuranceDocumentCategory(v: unknown): v is string {
  return typeof v === "string" && INSURANCE_DOCUMENT_CATEGORIES.some((c) => c.value === v);
}

/** Order the card lists documents in: the ones you reach for first, first. */
export const INSURANCE_DOCUMENT_CATEGORY_ORDER: readonly string[] = INSURANCE_DOCUMENT_CATEGORIES.map((c) => c.value);

export const INSURANCE_DOCUMENT_MAX_MB = DOCUMENT_MAX_MB;
export const INSURANCE_DOCUMENT_ACCEPT = DOCUMENT_ACCEPT;

export const isAllowedInsuranceDocument = isAllowedDocumentFile;

/** Bucket path for a fresh upload. */
export function insuranceStoragePath(policyId: string, fileName: string, now = Date.now()): string {
  return documentStoragePath("insurance", policyId, fileName, now);
}

/** Sort documents for display: category order, then newest upload first. */
export function sortInsuranceDocuments<T extends { category: string; uploadedAt: string | Date }>(docs: T[]): T[] {
  return sortDocumentsByCategory(docs, INSURANCE_DOCUMENT_CATEGORY_ORDER);
}

export type PolicyLifecycle = "expired" | "expiring" | "upcoming" | "active";

/**
 * Where a policy sits today. `expiringWithinDays` is the page's amber window
 * (60 days — wider than the 30-day email alert so managers see it coming).
 */
export function policyLifecycle(
  startDate: string | Date,
  endDate: string | Date,
  today = new Date(),
  expiringWithinDays = 60,
): { status: PolicyLifecycle; daysToEnd: number; daysToStart: number } {
  const day = 86_400_000;
  const t = new Date(today); t.setHours(0, 0, 0, 0);
  const s = new Date(startDate); s.setHours(0, 0, 0, 0);
  const e = new Date(endDate); e.setHours(0, 0, 0, 0);
  const daysToEnd = Math.round((e.getTime() - t.getTime()) / day);
  const daysToStart = Math.round((s.getTime() - t.getTime()) / day);
  let status: PolicyLifecycle = "active";
  if (daysToEnd < 0) status = "expired";
  else if (daysToStart > 0) status = "upcoming";
  else if (daysToEnd <= expiringWithinDays) status = "expiring";
  return { status, daysToEnd, daysToStart };
}

/**
 * Pre-fill for "Renew": same cover, the new term starts the day after the old
 * one ends and runs for the same length (a year for the usual annual policy).
 */
export function renewalDates(startDate: string | Date, endDate: string | Date): { startDate: string; endDate: string } {
  const s = new Date(startDate);
  const e = new Date(endDate);
  const termDays = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000));
  const newStart = new Date(e); newStart.setDate(newStart.getDate() + 1);
  const newEnd = new Date(newStart);
  // Anything close to a year renews as a calendar year (a 352-day first term
  // is usually a mid-cycle start, not a short policy); shorter terms keep
  // their length.
  if (termDays >= 300) {
    newEnd.setFullYear(newEnd.getFullYear() + 1);
    newEnd.setDate(newEnd.getDate() - 1);
  } else {
    newEnd.setDate(newEnd.getDate() + termDays);
  }
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { startDate: ymd(newStart), endDate: ymd(newEnd) };
}
