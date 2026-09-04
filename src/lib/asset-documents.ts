/**
 * Asset register documents — pure helpers shared by the API routes, the
 * upload component and the asset card. No Prisma, no React.
 */
import { categoryLabelMap, type DocumentCategoryDef } from "@/lib/document-files";

export const ASSET_DOCUMENT_CATEGORIES: readonly DocumentCategoryDef[] = [
  { value: "WARRANTY",        label: "Warranty",        hint: "Warranty card or certificate — what it covers and until when" },
  { value: "MANUAL",          label: "Manual",          hint: "User or service manual, spec sheet" },
  { value: "INVOICE_RECEIPT", label: "Invoice / receipt", hint: "Purchase invoice or proof of payment" },
  { value: "SERVICE_REPORT",  label: "Service report",  hint: "Technician's report from a service or repair" },
  { value: "CERTIFICATE",     label: "Certificate",     hint: "Test or inspection certificate (lift, pressure vessel, electrical)" },
  { value: "PHOTO",           label: "Photo",           hint: "Condition photos, serial-number plate" },
  { value: "OTHER",           label: "Other",           hint: "Anything else related to this asset" },
];

export const ASSET_DOCUMENT_CATEGORY_LABEL = categoryLabelMap(ASSET_DOCUMENT_CATEGORIES);
export const ASSET_DOCUMENT_CATEGORY_ORDER: readonly string[] = ASSET_DOCUMENT_CATEGORIES.map((c) => c.value);

export function isAssetDocumentCategory(v: unknown): v is string {
  return typeof v === "string" && ASSET_DOCUMENT_CATEGORIES.some((c) => c.value === v);
}

export type WarrantyStatus = "none" | "expired" | "expiring" | "valid";

/** Warranty position today; `expiringWithinDays` is the page's amber window. */
export function warrantyLifecycle(
  warrantyExpiry: string | Date | null | undefined,
  today = new Date(),
  expiringWithinDays = 90,
): { status: WarrantyStatus; daysLeft: number | null } {
  if (!warrantyExpiry) return { status: "none", daysLeft: null };
  const t = new Date(today); t.setHours(0, 0, 0, 0);
  const e = new Date(warrantyExpiry); e.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((e.getTime() - t.getTime()) / 86_400_000);
  if (daysLeft < 0) return { status: "expired", daysLeft };
  if (daysLeft <= expiringWithinDays) return { status: "expiring", daysLeft };
  return { status: "valid", daysLeft };
}
