/**
 * Vendor read projection per role + duplicate-name normalisation.
 *
 * Vendors are ORG-scoped: one registry every property reads. The on-site
 * CARETAKER may create vendors with the full field set (they meet the
 * contractor; a half-captured vendor a manager must chase is worse), but
 * only ever reads a trimmed record — the list endpoint would otherwise hand
 * every contractor's banking to an on-site role in one call.
 */

export const VENDOR_TRIMMED_SELECT = {
  id: true,
  name: true,
  category: true,
  phone: true,
  isActive: true,
} as const;

export type TrimmedVendor = {
  id: string;
  name: string;
  category: string;
  phone: string | null;
  isActive: boolean;
};

/** Roles that only get the trimmed vendor shape on reads. */
export function vendorReadIsTrimmed(orgRole: string | null | undefined): boolean {
  return orgRole === "CARETAKER";
}

/** Strip a full vendor record down to the trimmed shape (pure, for tests + in-memory use). */
export function projectVendorForRole<T extends TrimmedVendor>(
  vendor: T,
  orgRole: string | null | undefined,
): T | TrimmedVendor {
  if (!vendorReadIsTrimmed(orgRole)) return vendor;
  return {
    id: vendor.id,
    name: vendor.name,
    category: vendor.category,
    phone: vendor.phone ?? null,
    isActive: vendor.isActive,
  };
}

/**
 * Normalise a vendor name for duplicate detection: case-, whitespace- and
 * punctuation-insensitive. "  Acme,  Ltd. " and "acme ltd" collide; "Acme
 * Plumbing" and "Acme Electrical" do not (two contractors with similar names
 * is legitimate — the check is a soft warning with an override, never a
 * hard block).
 */
export function normalizeVendorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,;:!?'"`()\[\]{}<>\-_\/\&+*#@|~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
