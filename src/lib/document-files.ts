/**
 * Shared rules for files attached to a record (insurance policies, assets):
 * what may be uploaded, where it lives in storage, and how legacy rows differ.
 * Pure — no Prisma, no React.
 */

export const DOCUMENT_MAX_MB = 10;
export const DOCUMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.doc,.docx,.xls,.xlsx";

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
export function isAllowedDocumentFile(file: { type: string; name: string }): boolean {
  return file.type ? ALLOWED_TYPES.has(file.type) : ALLOWED_EXTENSIONS.test(file.name);
}

/**
 * Rows created before the move to private storage hold a full public URL in
 * `fileUrl`; newer rows hold a bucket path that has to be signed on read.
 */
export function isLegacyPublicUrl(fileUrl: string): boolean {
  return /^https?:\/\//i.test(fileUrl);
}

/** Bucket path for a fresh upload: `<prefix>/<recordId>/<timestamp>-<safe name>`. */
export function documentStoragePath(prefix: string, recordId: string, fileName: string, now = Date.now()): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${prefix}/${recordId}/${now}-${safe}`;
}

/** Sort documents for display: the given category order, then newest upload first. */
export function sortDocumentsByCategory<T extends { category: string; uploadedAt: string | Date }>(
  docs: T[],
  order: readonly string[],
): T[] {
  return [...docs].sort((a, b) => {
    const ca = order.indexOf(a.category);
    const cb = order.indexOf(b.category);
    if (ca !== cb) return ca - cb;
    return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
  });
}

export interface DocumentCategoryDef {
  value: string;
  label: string;
  hint: string;
}

export function categoryLabelMap(categories: readonly DocumentCategoryDef[]): Record<string, string> {
  return Object.fromEntries(categories.map((c) => [c.value, c.label]));
}
