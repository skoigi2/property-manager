/**
 * Insurance policy documents — pure helpers shared by the API routes, the
 * upload component and the policy card. No Prisma, no React.
 */

export const INSURANCE_DOCUMENT_CATEGORIES = [
  { value: "POLICY_SCHEDULE",    label: "Policy schedule",    hint: "The policy wording / schedule from the insurer" },
  { value: "CERTIFICATE",        label: "Certificate",        hint: "Certificate of insurance or cover note" },
  { value: "VALUATION_REPORT",   label: "Valuation report",   hint: "Independent valuation the sum insured is based on" },
  { value: "INSURER_ASSESSMENT", label: "Insurer assessment", hint: "Survey / risk assessment carried out by the insurer" },
  { value: "CLAIM",              label: "Claim",              hint: "Claim forms, correspondence, settlement letters" },
  { value: "INVOICE_RECEIPT",    label: "Invoice / receipt",  hint: "Premium invoice or proof of payment" },
  { value: "OTHER",              label: "Other",              hint: "Anything else related to this policy" },
] as const;

export type InsuranceDocumentCategoryValue = (typeof INSURANCE_DOCUMENT_CATEGORIES)[number]["value"];

export const INSURANCE_DOCUMENT_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  INSURANCE_DOCUMENT_CATEGORIES.map((c) => [c.value, c.label]),
);

export function isInsuranceDocumentCategory(v: unknown): v is InsuranceDocumentCategoryValue {
  return typeof v === "string" && INSURANCE_DOCUMENT_CATEGORIES.some((c) => c.value === v);
}

/** Order the card lists documents in: the ones you reach for first, first. */
export const INSURANCE_DOCUMENT_CATEGORY_ORDER: readonly string[] = INSURANCE_DOCUMENT_CATEGORIES.map((c) => c.value);

export const INSURANCE_DOCUMENT_MAX_MB = 10;
export const INSURANCE_DOCUMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.doc,.docx,.xls,.xlsx";

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const ALLOWED_EXTENSIONS = /\.(pdf|jpe?g|png|webp|heic|heif|docx?|xlsx?)$/i;

/** Some browsers give HEIC (and some Office) files an empty MIME type — fall back to the extension. */
export function isAllowedInsuranceDocument(file: { type: string; name: string }): boolean {
  return file.type ? ALLOWED_TYPES.has(file.type) : ALLOWED_EXTENSIONS.test(file.name);
}

/**
 * Rows created before the move to private storage hold a full public URL in
 * `fileUrl`; newer rows hold a bucket path that has to be signed on read.
 */
export function isLegacyPublicUrl(fileUrl: string): boolean {
  return /^https?:\/\//i.test(fileUrl);
}

/** Bucket path for a fresh upload. */
export function insuranceStoragePath(policyId: string, fileName: string, now = Date.now()): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `insurance/${policyId}/${now}-${safe}`;
}

/** Sort documents for display: category order, then newest upload first. */
export function sortInsuranceDocuments<T extends { category: string; uploadedAt: string | Date }>(docs: T[]): T[] {
  return [...docs].sort((a, b) => {
    const ca = INSURANCE_DOCUMENT_CATEGORY_ORDER.indexOf(a.category);
    const cb = INSURANCE_DOCUMENT_CATEGORY_ORDER.indexOf(b.category);
    if (ca !== cb) return ca - cb;
    return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
  });
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
